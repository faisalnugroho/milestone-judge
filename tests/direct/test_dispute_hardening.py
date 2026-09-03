"""Steward-requested regression tests for the dispute hardening of
MilestoneJudge (2026-09 resubmission round).

Covers exactly what the GenLayer Builder steward asked for:
  1. test_dispute_cannot_resolve_immediately — no settlement before the
     24h response window closes (on-chain enforced).
  2. Response-window boundary tests (1s before / exactly at / 1s after).
  3. Empty-evidence policy: submit_evidence([]) rejected, open_dispute([])
     accepted (reason-sufficiency policy), submit_dispute_evidence([])
     rejected, empty/unfetchable evidence -> INSUFFICIENT_EVIDENCE, never
     APPROVED, escrow never released on empty evidence.
  4. Fair evidence fetch budget: rebuttal evidence receives its reserved
     budget regardless of array order; hard total cap never exceeded;
     allocation is deterministic and category-based.
"""
import json

import pytest

import helpers as H
from helpers import (
    CONTRACT, AMOUNT, PAGE_BODY, EMPTY_BODY, BIG_BODY, BIG_BODY_6K,
    addr_str, create_milestone, fund, balance_of,
    llm_all_pass, llm_empty_ok, submit_evidence,
    dispute_with_rebuttal_ready,
)


@pytest.fixture()
def deployed(direct_vm, direct_deploy, direct_alice, direct_bob):
    H.install_transfer_hook(direct_vm)
    contract = direct_deploy(CONTRACT)
    H.fund_contract(direct_vm)
    direct_vm.sender = direct_alice
    return contract


@pytest.fixture()
def parties(direct_alice, direct_bob):
    return direct_alice, direct_bob


def _approved(direct_vm, deployed, alice, bob):
    create_milestone(direct_vm, deployed, alice, bob)
    fund(direct_vm, deployed, alice, 1)
    submit_evidence(direct_vm, deployed, bob, 1, body=PAGE_BODY)
    direct_vm.mock_llm(".*", llm_all_pass())
    direct_vm.sender = alice
    deployed.start_adjudication(1)


def _open_dispute_now(direct_vm, deployed, alice):
    direct_vm.sender = alice
    deployed.open_dispute(
        1, "The verdict does not reflect the evidence",
        json.dumps([{"url": "https://acme.example.com/d1"}]))


# ---------------------------------------------------------------------------
# 1. IMMEDIATE RESOLUTION — the core steward regression
# ---------------------------------------------------------------------------

class TestDisputeCannotResolveImmediately:
    def test_dispute_cannot_resolve_immediately(self, deployed, parties,
                                                direct_vm):
        """open_dispute -> resolve_dispute in the same block of time MUST
        revert; escrow stays locked, milestone stays DISPUTED, dispute stays
        OPEN, no settlement, no transfer."""
        alice, bob = parties
        _approved(direct_vm, deployed, alice, bob)
        _open_dispute_now(direct_vm, deployed, alice)

        worker_before = balance_of(direct_vm, bob)
        client_before = balance_of(direct_vm, alice)
        direct_vm.sender = alice
        with pytest.raises(Exception, match="response window"):
            deployed.resolve_dispute(1)

        rec = json.loads(deployed.get_milestone(1))
        d = json.loads(deployed.get_dispute(1))
        assert rec["status"] == "DISPUTED"
        assert rec["balance_wei"] == str(AMOUNT)      # escrow still locked
        assert rec["released"] is False
        assert rec["refunded"] is False
        assert d["status"] == "OPEN"
        assert balance_of(direct_vm, bob) == worker_before   # no transfer
        assert balance_of(direct_vm, alice) == client_before

    def test_dispute_resolves_after_window(self, deployed, parties,
                                           direct_vm):
        """Advance time past response_deadline (but stay inside the 3-day
        dispute-opening window): resolve performs the fresh consensus round
        and settles deterministically."""
        alice, bob = parties
        _approved(direct_vm, deployed, alice, bob)
        _open_dispute_now(direct_vm, deployed, alice)

        d = json.loads(deployed.get_dispute(1))
        deadline = int(d["response_deadline"])
        opened = int(d["opened_at"])
        assert deadline - opened == 24 * 3600            # 24h window stored

        H.set_time(direct_vm, H.iso_in_days(2))          # > 24h later
        direct_vm.clear_mocks()
        direct_vm.mock_web(GOOD_URL := "https://acme.example.com/dashboard",
                           PAGE_BODY)
        direct_vm.mock_web("https://acme.example.com/d1", PAGE_BODY)
        direct_vm.mock_llm(".*", llm_all_pass())
        direct_vm.sender = alice
        decision = deployed.resolve_dispute(1)

        assert decision == "APPROVED"
        rec = json.loads(deployed.get_milestone(1))
        d = json.loads(deployed.get_dispute(1))
        assert d["status"] == "RESOLVED"
        assert rec["status"] == "RELEASED"               # settled
        assert rec["released"] is True
        assert rec["balance_wei"] == "0"
        assert balance_of(direct_vm, bob) == AMOUNT      # worker paid
        hist = json.loads(deployed.get_adjudications(1))
        assert len(hist) == 2
        assert hist[1]["trigger"] == "dispute"           # fresh round

    def test_worker_also_blocked_immediately(self, deployed, parties,
                                             direct_vm):
        """Neither party can shortcut the window — worker tries too."""
        alice, bob = parties
        _approved(direct_vm, deployed, alice, bob)
        direct_vm.sender = bob          # the WORKER opens this dispute
        deployed.open_dispute(
            1, "worker disagrees with this approval",
            json.dumps([{"url": "https://acme.example.com/w1"}]))
        direct_vm.sender = bob
        with pytest.raises(Exception, match="response window"):
            deployed.resolve_dispute(1)


# ---------------------------------------------------------------------------
# 2. RESPONSE WINDOW BOUNDARIES (deterministic time warp)
# ---------------------------------------------------------------------------

class TestResponseWindowBoundaries:
    def _disputed(self, direct_vm, deployed, alice, bob):
        _approved(direct_vm, deployed, alice, bob)
        _open_dispute_now(direct_vm, deployed, alice)

    def test_one_second_before_deadline_rejected(self, deployed, parties,
                                                 direct_vm):
        alice, bob = parties
        self._disputed(direct_vm, deployed, alice, bob)
        d = json.loads(deployed.get_dispute(1))
        deadline = int(d["response_deadline"])
        H.set_time(direct_vm, H.epoch_to_iso(deadline - 1))
        direct_vm.sender = alice
        with pytest.raises(Exception, match="response window"):
            deployed.resolve_dispute(1)
        assert json.loads(deployed.get_milestone(1))["status"] == "DISPUTED"

    def test_exactly_at_deadline_allowed(self, deployed, parties, direct_vm):
        alice, bob = parties
        self._disputed(direct_vm, deployed, alice, bob)
        d = json.loads(deployed.get_dispute(1))
        deadline = int(d["response_deadline"])
        H.set_time(direct_vm, H.epoch_to_iso(deadline))   # boundary: allowed
        direct_vm.clear_mocks()
        direct_vm.mock_web("https://acme.example.com/dashboard", PAGE_BODY)
        direct_vm.mock_web("https://acme.example.com/d1", PAGE_BODY)
        direct_vm.mock_llm(".*", llm_all_pass())
        direct_vm.sender = alice
        decision = deployed.resolve_dispute(1)
        assert decision in ("APPROVED", "REJECTED", "INSUFFICIENT_EVIDENCE")
        assert json.loads(deployed.get_dispute(1))["status"] == "RESOLVED"

    def test_one_second_after_deadline_allowed(self, deployed, parties,
                                               direct_vm):
        alice, bob = parties
        self._disputed(direct_vm, deployed, alice, bob)
        d = json.loads(deployed.get_dispute(1))
        deadline = int(d["response_deadline"])
        H.set_time(direct_vm, H.epoch_to_iso(deadline + 1))
        direct_vm.clear_mocks()
        direct_vm.mock_web("https://acme.example.com/dashboard", PAGE_BODY)
        direct_vm.mock_web("https://acme.example.com/d1", PAGE_BODY)
        direct_vm.mock_llm(".*", llm_all_pass())
        direct_vm.sender = alice
        decision = deployed.resolve_dispute(1)
        assert decision in ("APPROVED", "REJECTED", "INSUFFICIENT_EVIDENCE")
        assert json.loads(deployed.get_dispute(1))["status"] == "RESOLVED"

    def test_rebuttal_evidence_allowed_during_window(self, deployed,
                                                     parties, direct_vm):
        """submit_dispute_evidence works at any point while OPEN — including
        right before the deadline."""
        alice, bob = parties
        self._disputed(direct_vm, deployed, alice, bob)
        d = json.loads(deployed.get_dispute(1))
        H.set_time(direct_vm,
                   H.epoch_to_iso(int(d["response_deadline"]) - 60))
        direct_vm.sender = bob
        deployed.submit_dispute_evidence(
            1, json.dumps([{"url": "https://acme.example.com/late-reb"}]))
        d = json.loads(deployed.get_dispute(1))
        assert len(d["evidence"]) == 2


# ---------------------------------------------------------------------------
# 3. EMPTY EVIDENCE POLICY
# ---------------------------------------------------------------------------

class TestEmptyEvidencePolicy:
    def test_submit_evidence_empty_array_rejected(self, deployed, parties,
                                                  direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        direct_vm.sender = bob
        with pytest.raises(Exception, match="empty"):
            deployed.submit_evidence(1, "[]", "statement about evidence")

    def test_open_dispute_empty_evidence_accepted(self, deployed, parties,
                                                  direct_vm):
        """POLICY: a dispute may rest on its reason alone. The original
        milestone evidence still exists and is re-evaluated; empty dispute
        evidence can never become PASS (see next tests)."""
        alice, bob = parties
        _approved(direct_vm, deployed, alice, bob)
        direct_vm.sender = alice
        deployed.open_dispute(1, "disputing based on reason alone", "[]")
        d = json.loads(deployed.get_dispute(1))
        assert d["status"] == "OPEN"
        assert d["evidence"] == []
        assert json.loads(deployed.get_milestone(1))["status"] == "DISPUTED"

    def test_open_dispute_invalid_url_rejected(self, deployed, parties,
                                               direct_vm):
        alice, bob = parties
        _approved(direct_vm, deployed, alice, bob)
        direct_vm.sender = alice
        with pytest.raises(Exception):
            deployed.open_dispute(1, "reason for the dispute here",
                                  json.dumps([{"url": "not-a-url"}]))

    def test_submit_dispute_evidence_empty_rejected(self, deployed,
                                                    parties, direct_vm):
        alice, bob = parties
        _approved(direct_vm, deployed, alice, bob)
        _open_dispute_now(direct_vm, deployed, alice)
        direct_vm.sender = bob
        with pytest.raises(Exception, match="empty"):
            deployed.submit_dispute_evidence(1, "[]")

    def test_empty_fetched_evidence_never_passes(self, deployed, parties,
                                                 direct_vm):
        """All evidence URLs unfetchable: verdict must not be APPROVED and
        the escrow must NOT be released to the worker. Even a hostile LLM
        mock that PASSes everything cannot make empty evidence APPROVED
        through the quality gate — and if consensus produced all-PASS+HIGH
        on empty evidence, the safety property is the dispute window +
        INSUFFICIENT routing. We test the honest-LLM case: INSUFFICIENT."""
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        # NO web mocks -> every URL fails to fetch -> empty bodies
        direct_vm.sender = bob
        deployed.submit_evidence(
            1, json.dumps([{"url": "https://down1.example.com/x"},
                           {"url": "https://down2.example.com/x"}]),
            "the deliverable is at those urls")
        direct_vm.mock_llm(".*", llm_empty_ok())
        direct_vm.sender = alice
        decision = deployed.start_adjudication(1)
        assert decision == "INSUFFICIENT_EVIDENCE"
        rec = json.loads(deployed.get_milestone(1))
        assert rec["balance_wei"] == str(AMOUNT)   # not released
        assert rec["released"] is False

    def test_empty_evidence_dispute_round_not_approved(self, deployed,
                                                       parties, direct_vm):
        """Dispute with zero dispute evidence and unfetchable base evidence:
        resolution (after window) must NOT approve; escrow refunded, not
        released."""
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        direct_vm.sender = bob
        deployed.submit_evidence(
            1, json.dumps([{"url": "https://gone.example.com/x"}]),
            "the deliverable used to live here")
        direct_vm.mock_llm(".*", llm_empty_ok())
        direct_vm.sender = alice
        assert deployed.start_adjudication(1) == "INSUFFICIENT_EVIDENCE"
        # worker disputes the INSUFFICIENT verdict with NO dispute evidence
        direct_vm.sender = bob
        deployed.open_dispute(1, "the evidence was valid actually", "[]")
        H.set_time(direct_vm, H.iso_in_days(2))     # past response window
        direct_vm.mock_llm(".*", llm_empty_ok())
        direct_vm.sender = bob
        decision = deployed.resolve_dispute(1)
        assert decision == "INSUFFICIENT_EVIDENCE"   # never APPROVED
        rec = json.loads(deployed.get_milestone(1))
        assert rec["status"] == "REFUNDED"           # client protected
        assert rec["refunded"] is True
        assert balance_of(direct_vm, alice) == AMOUNT
        assert balance_of(direct_vm, bob) == 0       # worker got nothing


# ---------------------------------------------------------------------------
# 4. OTHER PARTY CAN ADD EVIDENCE (both parties, authorization)
# ---------------------------------------------------------------------------

class TestRebuttalEvidenceAccess:
    def test_opener_can_add_more_evidence(self, deployed, parties,
                                          direct_vm):
        alice, bob = parties
        _approved(direct_vm, deployed, alice, bob)
        direct_vm.sender = alice
        deployed.open_dispute(
            1, "disputing with initial evidence",
            json.dumps([{"url": "https://acme.example.com/o1"}]))
        direct_vm.sender = alice                    # same party adds more
        deployed.submit_dispute_evidence(
            1, json.dumps([{"url": "https://acme.example.com/o2"}]))
        d = json.loads(deployed.get_dispute(1))
        urls = [e["url"] for e in d["evidence"]]
        assert "https://acme.example.com/o1" in urls
        assert "https://acme.example.com/o2" in urls

    def test_other_party_can_add_rebuttal(self, deployed, parties,
                                          direct_vm):
        alice, bob = parties
        _approved(direct_vm, deployed, alice, bob)
        direct_vm.sender = alice
        deployed.open_dispute(
            1, "worker did not deliver",
            json.dumps([{"url": "https://acme.example.com/c1"}]))
        # opening evidence must carry full provenance too (actor + at)
        d = json.loads(deployed.get_dispute(1))
        opener_item = d["evidence"][0]
        assert opener_item["actor"] == addr_str(alice)
        assert opener_item["at"] != ""
        assert opener_item["source"] == "DISPUTE"
        direct_vm.sender = bob                      # the OTHER party
        deployed.submit_dispute_evidence(
            1, json.dumps([{"url": "https://acme.example.com/w-reb",
                            "note": "rebuttal from worker"}]))
        d = json.loads(deployed.get_dispute(1))
        assert len(d["evidence"]) == 2
        reb = d["evidence"][1]
        assert reb["actor"] == addr_str(bob)
        assert reb["source"] == "DISPUTE"
        assert reb["note"] == "rebuttal from worker"
        assert reb["at"] != ""

    def test_evidence_not_overwritten(self, deployed, parties, direct_vm):
        alice, bob = parties
        _approved(direct_vm, deployed, alice, bob)
        direct_vm.sender = alice
        deployed.open_dispute(
            1, "dispute reason here",
            json.dumps([{"url": "https://acme.example.com/first"}]))
        for i in range(3):
            direct_vm.sender = bob
            deployed.submit_dispute_evidence(
                1, json.dumps([{"url":
                                "https://acme.example.com/r%d" % i}]))
        d = json.loads(deployed.get_dispute(1))
        urls = [e["url"] for e in d["evidence"]]
        assert urls == ["https://acme.example.com/first",
                        "https://acme.example.com/r0",
                        "https://acme.example.com/r1",
                        "https://acme.example.com/r2"]

    def test_stranger_cannot_add_rebuttal(self, deployed, parties,
                                          direct_vm, direct_charlie):
        alice, bob = parties
        _approved(direct_vm, deployed, alice, bob)
        _open_dispute_now(direct_vm, deployed, alice)
        direct_vm.sender = direct_charlie
        with pytest.raises(Exception):
            deployed.submit_dispute_evidence(
                1, json.dumps([{"url": "https://acme.example.com/x"}]))

    def test_rebuttal_limit_enforced(self, deployed, parties, direct_vm):
        """MAX_DISPUTE_EVIDENCE (= 5*4 = 20) caps total dispute evidence
        (spam guard). Opening evidence counts toward the cap."""
        alice, bob = parties
        _approved(direct_vm, deployed, alice, bob)
        direct_vm.sender = alice
        deployed.open_dispute(1, "spam test dispute reason",
                              json.dumps([{"url":
                                           "https://acme.example.com/s0"}]))
        # opener used 1 slot; fill to exactly 20 in two calls
        direct_vm.sender = bob
        deployed.submit_dispute_evidence(
            1, json.dumps([
                {"url": "https://acme.example.com/b1-%d" % j}
                for j in range(5)]))
        direct_vm.sender = bob
        deployed.submit_dispute_evidence(
            1, json.dumps([
                {"url": "https://acme.example.com/b2-%d" % j}
                for j in range(5)]))
        direct_vm.sender = bob
        deployed.submit_dispute_evidence(
            1, json.dumps([
                {"url": "https://acme.example.com/b3-%d" % j}
                for j in range(4)]))          # 1+5+5+4 = 15
        direct_vm.sender = bob
        deployed.submit_dispute_evidence(
            1, json.dumps([
                {"url": "https://acme.example.com/b4-%d" % j}
                for j in range(5)]))          # 15+5 = 20 exactly
        d = json.loads(deployed.get_dispute(1))
        assert len(d["evidence"]) == 20
        # one more item must exceed the cap and revert
        direct_vm.sender = bob
        with pytest.raises(Exception, match="limit"):
            deployed.submit_dispute_evidence(
                1, json.dumps([{"url": "https://acme.example.com/over"}]))
        d = json.loads(deployed.get_dispute(1))
        assert len(d["evidence"]) == 20      # unchanged

    def test_original_adjudication_immutable(self, deployed, parties,
                                             direct_vm):
        """Original adjudication history entry survives the dispute round
        unchanged."""
        alice, bob = parties
        _approved(direct_vm, deployed, alice, bob)
        before = json.loads(deployed.get_adjudications(1))[0]
        _open_dispute_now(direct_vm, deployed, alice)
        direct_vm.sender = bob
        deployed.submit_dispute_evidence(
            1, json.dumps([{"url": "https://acme.example.com/reb"}]))
        H.set_time(direct_vm, H.iso_in_days(2))
        direct_vm.clear_mocks()
        direct_vm.mock_web("https://acme.example.com/dashboard", PAGE_BODY)
        direct_vm.mock_web("https://acme.example.com/d1", PAGE_BODY)
        direct_vm.mock_web("https://acme.example.com/reb", PAGE_BODY)
        direct_vm.mock_llm(".*", llm_all_pass())
        direct_vm.sender = alice
        deployed.resolve_dispute(1)
        after = json.loads(deployed.get_adjudications(1))
        assert len(after) == 2
        assert after[0] == before              # untouched


# ---------------------------------------------------------------------------
# 5. FAIR FETCH BUDGET / EVIDENCE-ORDER EXHAUSTION
# ---------------------------------------------------------------------------

class TestFairFetchBudget:
    """The steward regression: in a sequential first-come-first-served
    design, 4 base URLs of 5000 chars consume the whole 20000-char budget
    and rebuttal URLs receive ZERO content. With the fair budget, rebuttal
    evidence has a RESERVED 6000-char budget independent of array order.
    We prove it by spying on the actual LLM prompt the contract builds
    (leader AND validator see identical content) and measuring the chars
    each evidence URL contributed."""

    def _spy_llm(self, direct_vm):
        seen = []
        vm = direct_vm
        orig = vm._match_llm_mock

        def recording(prompt):
            seen.append(prompt)
            return orig(prompt)

        vm._match_llm_mock = recording
        return seen, lambda: setattr(vm, "_match_llm_mock", orig)

    def _body_len_for(self, prompt, url):
        """Chars of fetched content the LLM prompt gave this URL.

        The evidence block ends either at the next '--- EVIDENCE' header
        or (for the last evidence item in a dispute round) at the
        'DISPUTE CONTEXT' section — whichever comes first."""
        idx = prompt.find(url + "\n")
        if idx == -1:
            return None
        seg = prompt[idx + len(url):]
        marker = "fetched content:\n"
        cs = seg.find(marker)
        if cs == -1:
            return None
        chunk = seg[cs + len(marker):]
        ends = [e for e in (chunk.find("\n--- EVIDENCE "),
                            chunk.find("\nDISPUTE CONTEXT")) if e != -1]
        end = min(ends) if ends else len(chunk)
        return len(chunk[:end].rstrip("\n"))

    def test_local_allocator_is_fair(self):
        """The contract's allocation math (mirrored here): equal integer
        shares per category, redistribution of unused budget, hard caps."""
        BASE_BUDGET, REB_BUDGET = 14000, 6000

        def alloc(raws, budget):
            n = len(raws)
            shares = [budget // n] * n
            for k in range(n):
                if raws[k] < shares[k]:
                    shares[k] = raws[k]
            changed = True
            while changed:
                changed = False
                total = sum(shares)
                if total >= budget:
                    break
                for k in range(n):
                    if total >= budget:
                        break
                    want = raws[k] - shares[k]
                    if want > 0:
                        give = min(want, budget - total)
                        shares[k] += give
                        total += give
                        changed = True
            return shares

        # steward's example: 4 base x 5000, 2 rebuttal x 5000
        assert alloc([5000] * 4, BASE_BUDGET) == [3500] * 4
        assert alloc([5000] * 2, REB_BUDGET) == [3000] * 2
        # short/failed URLs free budget; the redistribution is IN-ORDER
        # (first come first served within a category, deterministic):
        # equal shares [3500,3500,3500,3500] -> URL0 only has 100 so 3400
        # frees up -> URL1 takes it (up to its raw 5000) -> URL2 takes the
        # last 400.
        assert alloc([100, 5000, 5000, 5000], BASE_BUDGET) \
            == [100, 5000, 5000, 3900]
        # a failed URL contributes nothing but never steals budget
        assert alloc([0, 5000], REB_BUDGET) == [0, 5000]
        # caps hold
        assert sum(alloc([5000] * 4, BASE_BUDGET)) \
            + sum(alloc([5000] * 2, REB_BUDGET)) == 20000

    def test_rebuttal_not_starved_by_order(self, deployed, parties,
                                           direct_vm):
        """4 base URLs (5000 chars each) would consume the entire 20k
        budget sequentially; the reserved rebuttal budget guarantees the
        2 rebuttal URLs still contribute 3000 chars each. Measured from
        the real prompt built by the real contract fetch path."""
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        # worker base evidence = 4 big pages (5000 chars each)
        base_urls = ["https://acme.example.com/b%d" % i for i in range(4)]
        H.submit_evidence_multi(direct_vm, deployed, bob, 1,
                                [(u, BIG_BODY) for u in base_urls])
        direct_vm.mock_llm(".*", llm_all_pass())
        direct_vm.sender = alice
        deployed.start_adjudication(1)

        reb_urls = ["https://acme.example.com/r%d" % i for i in range(2)]
        for u in reb_urls:
            H.mock_body(direct_vm, u, BIG_BODY)
        direct_vm.sender = alice
        deployed.open_dispute(
            1, "rebuttal must receive its reserved budget",
            json.dumps([{"url": u} for u in reb_urls]))
        H.set_time(direct_vm, H.iso_in_days(2))
        direct_vm.mock_llm(".*", llm_all_pass())

        seen, restore = self._spy_llm(direct_vm)
        try:
            direct_vm.sender = alice
            deployed.resolve_dispute(1)
        finally:
            restore()

        assert len(seen) >= 1        # leader ran the pipeline (direct mode)
        prompt = seen[0]
        for u in reb_urls:
            n = self._body_len_for(prompt, u)
            assert n is not None, "rebuttal URL missing from prompt"
            assert n == 3000, (
                "rebuttal starved: got %d chars (expected reserved "
                "share 3000)" % n)
        for u in base_urls:
            n = self._body_len_for(prompt, u)
            assert n is not None, "base URL missing from prompt: " + u
            assert n <= 3500, (
                "base URL over fair share: %d (4-way split of 14000 "
                "should cap at 3500)" % n)
        # sequential order (base first) would have starved rebuttal to 0;
        # with the reserved budgets both categories contributed: 14000
        # base + 6000 rebuttal = 20000 chars of real fetched evidence.
        lens = [self._body_len_for(prompt, u)
                for u in base_urls + reb_urls]
        assert None not in lens
        assert sum(lens) == 20000

    def test_hard_total_cap_never_exceeded(self, deployed, parties,
                                           direct_vm):
        """All URLs longer than the per-URL cap: total fetched content
        still bounded by the disjoint category budgets (14000 + 6000)."""
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        base_urls = ["https://acme.example.com/cap-b%d" % i
                     for i in range(4)]
        H.submit_evidence_multi(direct_vm, deployed, bob, 1,
                                [(u, BIG_BODY_6K) for u in base_urls])
        direct_vm.mock_llm(".*", llm_all_pass())
        direct_vm.sender = alice
        deployed.start_adjudication(1)

        reb_urls = ["https://acme.example.com/cap-r%d" % i
                    for i in range(2)]
        for u in reb_urls:
            H.mock_body(direct_vm, u, BIG_BODY_6K)
        direct_vm.sender = alice
        deployed.open_dispute(1, "cap test dispute reason here",
                              json.dumps([{"url": u} for u in reb_urls]))
        H.set_time(direct_vm, H.iso_in_days(2))
        direct_vm.mock_llm(".*", llm_all_pass())

        seen, restore = self._spy_llm(direct_vm)
        try:
            direct_vm.sender = alice
            deployed.resolve_dispute(1)
        finally:
            restore()

        prompt = seen[0]
        lens = [self._body_len_for(prompt, u)
                for u in base_urls + reb_urls]
        assert None not in lens
        # 4 base URLs of 6000 -> share 3500 each => 14000 total
        # 2 rebuttal URLs of 6000 -> share 3000 each => 6000 total
        # Grand total fetched = 20000 = MAX_TOTAL_CONTENT exactly, never >.
        assert sum(lens) <= 20000
        for u, n in zip(reb_urls, lens[-2:]):
            assert n == 3000, (
                "rebuttal share broken: %s got %d" % (u, n))

    def test_allocation_independent_of_dispute_evidence_order(
            self, deployed, parties, direct_vm):
        """Case B of the steward's ordering test: rebuttal items listed in
        REVERSE order receive identical shares — allocation depends on the
        category metadata, not array position."""
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        submit_evidence(direct_vm, deployed, bob, 1, body=PAGE_BODY)
        direct_vm.mock_llm(".*", llm_all_pass())
        direct_vm.sender = alice
        deployed.start_adjudication(1)

        reb_urls = ["https://acme.example.com/ord1",
                    "https://acme.example.com/ord2"]
        for u in reb_urls:
            H.mock_body(direct_vm, u, BIG_BODY)
        direct_vm.sender = alice
        deployed.open_dispute(1, "ordering determinism test reason",
                              json.dumps([{"url": u} for u in
                                          reversed(reb_urls)]))
        H.set_time(direct_vm, H.iso_in_days(2))
        direct_vm.mock_llm(".*", llm_all_pass())
        seen, restore = self._spy_llm(direct_vm)
        try:
            direct_vm.sender = alice
            deployed.resolve_dispute(1)
        finally:
            restore()
        prompt = seen[0]
        n1 = self._body_len_for(prompt, reb_urls[0])
        n2 = self._body_len_for(prompt, reb_urls[1])
        assert n1 == 3000 and n2 == 3000

    def test_failed_base_url_frees_budget_within_category(
            self, deployed, parties, direct_vm):
        """A failed base fetch does NOT steal budget and does NOT spill
        into the rebuttal category; surviving base URLs share what it
        freed (deterministic redistribution inside the category)."""
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        # base evidence: one URL that fetches (mocked), one that FAILS
        # (no mock registered -> contract catches -> empty body)
        ok_url = "https://acme.example.com/base-ok"
        dead_url = "https://acme.example.com/base-dead"
        H.submit_evidence_multi(direct_vm, deployed, bob, 1,
                                [(ok_url, BIG_BODY),
                                 (dead_url, None)])  # None: no mock
        direct_vm.mock_llm(".*", llm_all_pass())
        direct_vm.sender = alice
        deployed.start_adjudication(1)

        reb_urls = ["https://acme.example.com/fail-reb"]
        H.mock_body(direct_vm, reb_urls[0], BIG_BODY)
        direct_vm.sender = alice
        deployed.open_dispute(1, "failure handling test reason",
                              json.dumps([{"url": u} for u in reb_urls]))
        H.set_time(direct_vm, H.iso_in_days(2))
        direct_vm.mock_llm(".*", llm_all_pass())
        seen, restore = self._spy_llm(direct_vm)
        try:
            direct_vm.sender = alice
            deployed.resolve_dispute(1)
        finally:
            restore()
        prompt = seen[0]
        # base category: dead URL got 0, ok URL takes the whole base
        # budget (5000 is its per-URL cap, below the 14000 category cap)
        n_dead = self._body_len_for(prompt, dead_url)
        n_ok = self._body_len_for(prompt, ok_url)
        assert n_dead == 0, "dead base URL should show empty content"
        assert n_ok == 5000, (
            "surviving base URL should use the freed budget up to its "
            "per-URL cap, got %d" % n_ok)
        # rebuttal category = 1 URL -> full budget, unaffected by the
        # base failure; per-URL cap applies (5000)
        assert self._body_len_for(prompt, reb_urls[0]) == 5000


# ---------------------------------------------------------------------------
# 6. Dispute evidence does NOT extend resolution rights before window
# ---------------------------------------------------------------------------

class TestDisputeWindowInterplay:
    def test_dispute_opening_window_still_enforced(self, deployed, parties,
                                                   direct_vm):
        """The 3-day OPENING window is unchanged and separate from the 24h
        RESPONSE window."""
        alice, bob = parties
        _approved(direct_vm, deployed, alice, bob)
        H.set_time(direct_vm, H.iso_in_days(10))     # > 3 days
        direct_vm.sender = alice
        with pytest.raises(Exception, match="dispute window has closed"):
            deployed.open_dispute(1, "too late now for this dispute", "[]")

    def test_response_window_metadata_stored(self, deployed, parties,
                                             direct_vm):
        alice, bob = parties
        _approved(direct_vm, deployed, alice, bob)
        _open_dispute_now(direct_vm, deployed, alice)
        d = json.loads(deployed.get_dispute(1))
        assert int(d["response_deadline"]) - int(d["opened_at"]) \
            == 24 * 3600
        params = json.loads(deployed.get_params())
        assert params["dispute_response_window_seconds"] == 24 * 3600
        assert params["dispute_window_seconds"] == 3 * 24 * 3600
        assert params["base_evidence_budget"] == 14000
        assert params["rebuttal_evidence_budget"] == 6000
