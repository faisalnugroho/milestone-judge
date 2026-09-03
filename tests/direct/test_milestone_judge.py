"""MilestoneJudge direct-mode test suite.

Covers: creation validation, escrow funding accounting, authorization,
submission flow, deadline enforcement, adjudication + deterministic
decision derivation, consensus comparison semantics, prompt-injection
audit trail, dispute lifecycle, settlement accounting, and invariants.
"""
import json

import pytest

import helpers as H
from helpers import (
    CONTRACT, AMOUNT, PAGE_BODY, EMPTY_BODY, INJECTION_BODY,
    addr_str, create_milestone, epoch_in_days, fund, fund_contract,
    install_transfer_hook, llm_all_pass, llm_c1_fail,
    llm_c1_insufficient, llm_injection_obedient, balance_of,
    make_criteria, submit_evidence,
)

GOOD_URL = "https://acme.example.com/dashboard"
BAD_URL = "https://x.example.com/whatever"


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


# ---------------------------------------------------------------------------
# 1. Milestone creation
# ---------------------------------------------------------------------------

class TestCreateMilestone:
    def test_creates_with_full_record(self, deployed, parties, direct_vm):
        alice, bob = parties
        mid = create_milestone(direct_vm, deployed, alice, bob)
        assert int(mid) == 1
        rec = json.loads(deployed.get_milestone(1))
        assert rec["status"] == "CREATED"
        assert rec["client"] == addr_str(alice)
        assert rec["worker"] == addr_str(bob)
        assert rec["amount_wei"] == str(AMOUNT)
        assert rec["balance_wei"] == "0"
        assert len(json.loads(rec["criteria"])) == 2
        assert rec["timeline"][0]["event"] == "created"

    def test_rejects_short_title(self, deployed, parties):
        _, bob = parties
        with pytest.raises(Exception):
            deployed.create_milestone(
                "ab", "desc", bob, make_criteria(), "evidence req",
                epoch_in_days(30), AMOUNT, "[]")

    def test_rejects_bad_criteria_json(self, deployed, parties):
        _, bob = parties
        with pytest.raises(Exception):
            deployed.create_milestone(
                "Title here", "desc", bob, "not-json", "ev",
                epoch_in_days(30), AMOUNT, "[]")
        with pytest.raises(Exception):
            deployed.create_milestone(
                "Title here", "desc", bob, "[]", "ev",
                epoch_in_days(30), AMOUNT, "[]")

    def test_rejects_past_deadline(self, deployed, parties):
        _, bob = parties
        with pytest.raises(Exception):
            deployed.create_milestone(
                "Title here", "desc", bob, make_criteria(), "ev",
                epoch_in_days(-5), AMOUNT, "[]")

    def test_rejects_worker_equals_client(self, deployed, parties):
        alice, _ = parties
        with pytest.raises(Exception):
            deployed.create_milestone(
                "Title here", "desc", alice, make_criteria(), "ev",
                epoch_in_days(30), AMOUNT, "[]")

    def test_rejects_dust_amount(self, deployed, parties):
        _, bob = parties
        with pytest.raises(Exception):
            deployed.create_milestone(
                "Title here", "desc", bob, make_criteria(), "ev",
                epoch_in_days(30), 10, "[]")

    def test_rejects_duplicate_criterion_ids(self, deployed, parties):
        _, bob = parties
        dup = json.dumps([
            {"id": "c1", "text": "first criterion here", "mandatory": True},
            {"id": "c1", "text": "duplicate id criterion", "mandatory": True},
        ])
        with pytest.raises(Exception):
            deployed.create_milestone(
                "Title here", "desc", bob, dup, "ev",
                epoch_in_days(30), AMOUNT, "[]")

    def test_indexes_both_parties(self, deployed, parties, direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        as_client = json.loads(deployed.get_milestones_for(addr_str(alice)))
        as_worker = json.loads(deployed.get_milestones_for(addr_str(bob)))
        assert as_client == [{"id": "1", "role": "client"}]
        assert as_worker == [{"id": "1", "role": "worker"}]

    def test_ids_increment(self, deployed, parties, direct_vm):
        alice, bob = parties
        assert int(create_milestone(direct_vm, deployed, alice, bob)) == 1
        assert int(create_milestone(direct_vm, deployed, alice, bob)) == 2


# ---------------------------------------------------------------------------
# 2. Escrow funding (real value accounting)
# ---------------------------------------------------------------------------

class TestFunding:
    def test_exact_amount_funds(self, deployed, parties, direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        rec = json.loads(deployed.get_milestone(1))
        assert rec["status"] == "FUNDED"
        assert rec["balance_wei"] == str(AMOUNT)

    def test_zero_value_rejected(self, deployed, parties, direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        direct_vm.sender = alice
        direct_vm.value = 0
        with pytest.raises(Exception):
            deployed.fund_milestone(1)
        assert json.loads(deployed.get_milestone(1))["status"] == "CREATED"

    def test_underfunding_rejected(self, deployed, parties, direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        direct_vm.sender = alice
        direct_vm.value = AMOUNT - 1
        with pytest.raises(Exception):
            deployed.fund_milestone(1)
        direct_vm.value = 0
        assert json.loads(deployed.get_milestone(1))["status"] == "CREATED"

    def test_overfunding_rejected(self, deployed, parties, direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        direct_vm.sender = alice
        direct_vm.value = AMOUNT * 2
        with pytest.raises(Exception):
            deployed.fund_milestone(1)
        direct_vm.value = 0
        assert json.loads(deployed.get_milestone(1))["status"] == "CREATED"

    def test_non_client_cannot_fund(self, deployed, parties, direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        direct_vm.sender = bob
        direct_vm.value = AMOUNT
        with pytest.raises(Exception):
            deployed.fund_milestone(1)
        direct_vm.value = 0
        assert json.loads(deployed.get_milestone(1))["status"] == "CREATED"

    def test_double_funding_rejected(self, deployed, parties, direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        direct_vm.sender = alice
        direct_vm.value = AMOUNT
        with pytest.raises(Exception):
            deployed.fund_milestone(1)
        direct_vm.value = 0
        rec = json.loads(deployed.get_milestone(1))
        assert rec["status"] == "FUNDED"
        assert rec["balance_wei"] == str(AMOUNT)  # not doubled

    def test_cannot_fund_nonexistent(self, deployed, parties):
        with pytest.raises(Exception):
            deployed.fund_milestone(99)


# ---------------------------------------------------------------------------
# 3. Cancel / expire (client protections)
# ---------------------------------------------------------------------------

class TestCancelExpire:
    def test_cancel_before_submission_refunds(self, deployed, parties,
                                               direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        bal_before = balance_of(direct_vm, alice)
        direct_vm.sender = alice
        deployed.cancel_milestone(1)
        rec = json.loads(deployed.get_milestone(1))
        assert rec["status"] == "CANCELLED"
        assert rec["refunded"] is True
        assert rec["balance_wei"] == "0"
        assert balance_of(direct_vm, alice) == bal_before + AMOUNT

    def test_cancel_unfunded_just_marks(self, deployed, parties, direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        direct_vm.sender = alice
        deployed.cancel_milestone(1)
        rec = json.loads(deployed.get_milestone(1))
        assert rec["status"] == "CANCELLED"
        assert rec["refunded"] is False

    def test_worker_cannot_cancel(self, deployed, parties, direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        direct_vm.sender = bob
        with pytest.raises(Exception):
            deployed.cancel_milestone(1)
        assert json.loads(deployed.get_milestone(1))["status"] == "FUNDED"

    def test_stranger_cannot_cancel(self, deployed, parties, direct_vm,
                                    direct_charlie):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        direct_vm.sender = direct_charlie
        with pytest.raises(Exception):
            deployed.cancel_milestone(1)

    def test_cancel_blocked_after_submission(self, deployed, parties,
                                              direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        submit_evidence(direct_vm, deployed, bob, 1, body=PAGE_BODY)
        direct_vm.sender = alice
        with pytest.raises(Exception):
            deployed.cancel_milestone(1)
        assert json.loads(deployed.get_milestone(1))["status"] == "SUBMITTED"

    def test_cancelled_milestone_rejects_funding(self, deployed, parties,
                                                 direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        direct_vm.sender = alice
        deployed.cancel_milestone(1)
        direct_vm.value = AMOUNT
        with pytest.raises(Exception):
            deployed.fund_milestone(1)
        direct_vm.value = 0


# ---------------------------------------------------------------------------
# 4. Evidence submission
# ---------------------------------------------------------------------------

class TestSubmitEvidence:
    def test_worker_submits_urls_and_statement(self, deployed, parties,
                                               direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        submit_evidence(direct_vm, deployed, bob, 1, body=PAGE_BODY)
        rec = json.loads(deployed.get_milestone(1))
        assert rec["status"] == "SUBMITTED"
        assert rec["evidence"][0]["url"] == GOOD_URL
        assert rec["evidence"][0]["kind"] == "WEBSITE"
        assert rec["submitted_at"] != ""
        assert rec["worker_statement"].startswith("The dashboard")

    def test_client_cannot_submit(self, deployed, parties, direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        direct_vm.sender = alice
        with pytest.raises(Exception):
            deployed.submit_evidence(
                1, json.dumps([{"url": GOOD_URL}]), "some statement here")

    def test_rejects_non_http_urls(self, deployed, parties, direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        direct_vm.sender = bob
        with pytest.raises(Exception):
            deployed.submit_evidence(
                1, json.dumps([{"url": "ftp://bad.example.com/x"}]),
                "statement about evidence")

    def test_rejects_empty_evidence(self, deployed, parties, direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        direct_vm.sender = bob
        with pytest.raises(Exception):
            deployed.submit_evidence(1, "[]", "statement about evidence")

    def test_rejects_short_statement(self, deployed, parties, direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        direct_vm.sender = bob
        with pytest.raises(Exception):
            deployed.submit_evidence(
                1, json.dumps([{"url": GOOD_URL}]), "short")

    def test_cannot_submit_before_funding(self, deployed, parties, direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        direct_vm.sender = bob
        with pytest.raises(Exception):
            deployed.submit_evidence(
                1, json.dumps([{"url": GOOD_URL}]),
                "statement about the evidence")

    def test_stranger_cannot_submit(self, deployed, parties, direct_vm,
                                    direct_charlie):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        direct_vm.sender = direct_charlie
        with pytest.raises(Exception):
            deployed.submit_evidence(
                1, json.dumps([{"url": GOOD_URL}]),
                "statement about the evidence")

    def test_evidence_kinds_normalized(self, deployed, parties, direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        direct_vm.sender = bob
        deployed.submit_evidence(
            1, json.dumps([{"url": GOOD_URL, "kind": "BOGUS_KIND"}]),
            "statement about the evidence")
        rec = json.loads(deployed.get_milestone(1))
        assert rec["evidence"][0]["kind"] == "OTHER"


# ---------------------------------------------------------------------------
# 5. Deadlines
# ---------------------------------------------------------------------------

class TestDeadlines:
    def test_late_submission_rejected(self, deployed, parties, direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob,
                         deadline=epoch_in_days(2))
        fund(direct_vm, deployed, alice, 1)
        H.set_time(direct_vm, H.iso_in_days(3))  # past deadline
        direct_vm.sender = bob
        with pytest.raises(Exception):
            deployed.submit_evidence(
                1, json.dumps([{"url": GOOD_URL}]),
                "statement about the evidence")
        assert json.loads(deployed.get_milestone(1))["status"] == "FUNDED"

    def test_expire_crank_refunds_client(self, deployed, parties, direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob,
                         deadline=epoch_in_days(2))
        fund(direct_vm, deployed, alice, 1)
        H.set_time(direct_vm, H.iso_in_days(3))
        direct_vm.sender = bob  # crank is permissionless; bob is convenient
        deployed.mark_expired(1)
        rec = json.loads(deployed.get_milestone(1))
        assert rec["status"] == "EXPIRED"
        assert rec["refunded"] is True
        assert rec["balance_wei"] == "0"
        assert balance_of(direct_vm, alice) == AMOUNT

    def test_expire_before_deadline_rejected(self, deployed, parties,
                                             direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob,
                         deadline=epoch_in_days(30))
        fund(direct_vm, deployed, alice, 1)
        direct_vm.sender = alice
        with pytest.raises(Exception):
            deployed.mark_expired(1)
        assert json.loads(deployed.get_milestone(1))["status"] == "FUNDED"

    def test_expire_blocked_after_submission(self, deployed, parties,
                                             direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob,
                         deadline=epoch_in_days(2))
        fund(direct_vm, deployed, alice, 1)
        submit_evidence(direct_vm, deployed, bob, 1, body=PAGE_BODY)
        H.set_time(direct_vm, H.iso_in_days(3))
        direct_vm.sender = alice
        with pytest.raises(Exception):
            deployed.mark_expired(1)
        assert json.loads(deployed.get_milestone(1))["status"] == "SUBMITTED"


# ---------------------------------------------------------------------------
# 6. Adjudication — the core intelligent flow
# ---------------------------------------------------------------------------

class TestAdjudication:
    def _ready(self, deployed, alice, bob, direct_vm, body=PAGE_BODY):
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        submit_evidence(direct_vm, deployed, bob, 1, body=body)

    def test_all_pass_approves(self, deployed, parties, direct_vm):
        alice, bob = parties
        self._ready(deployed, alice, bob, direct_vm)
        direct_vm.mock_llm(".*", llm_all_pass())
        direct_vm.sender = alice
        decision = deployed.start_adjudication(1)
        assert decision == "APPROVED"
        rec = json.loads(deployed.get_milestone(1))
        assert rec["status"] == "APPROVED"
        assert rec["verdict"]["rule"].startswith("all_mandatory_pass")
        assert rec["verdict"]["evidence_quality"] == "HIGH"
        assert len(rec["verdict"]["statuses"]) == 2
        assert int(rec["dispute_deadline"]) > int(rec["adjudicated_at"])
        hist = json.loads(deployed.get_adjudications(1))
        assert len(hist) == 1
        assert hist[0]["decision"] == "APPROVED"
        assert hist[0]["trigger"] == "adjudication"

    def test_fail_rejects(self, deployed, parties, direct_vm):
        alice, bob = parties
        self._ready(deployed, alice, bob, direct_vm, body=EMPTY_BODY)
        direct_vm.mock_llm(".*", llm_c1_fail())
        direct_vm.sender = bob  # worker can also trigger
        decision = deployed.start_adjudication(1)
        assert decision == "REJECTED"
        rec = json.loads(deployed.get_milestone(1))
        assert rec["verdict"]["rule"] == "mandatory_fail:c1"

    def test_insufficient_routes_to_review(self, deployed, parties,
                                           direct_vm):
        alice, bob = parties
        self._ready(deployed, alice, bob, direct_vm, body=EMPTY_BODY)
        direct_vm.mock_llm(".*", llm_c1_insufficient())
        direct_vm.sender = alice
        decision = deployed.start_adjudication(1)
        assert decision == "INSUFFICIENT_EVIDENCE"
        rec = json.loads(deployed.get_milestone(1))
        assert rec["verdict"]["rule"] == "mandatory_insufficient:c1"

    def test_low_quality_blocks_approval(self, deployed, parties, direct_vm):
        alice, bob = parties
        self._ready(deployed, alice, bob, direct_vm)
        direct_vm.mock_llm(".*", llm_all_pass(quality="LOW"))
        direct_vm.sender = alice
        decision = deployed.start_adjudication(1)
        assert decision == "INSUFFICIENT_EVIDENCE"
        rec = json.loads(deployed.get_milestone(1))
        assert rec["verdict"]["rule"] == "evidence_quality_low"

    def test_missing_criterion_maps_to_insufficient(self, deployed, parties,
                                                    direct_vm):
        alice, bob = parties
        self._ready(deployed, alice, bob, direct_vm)
        direct_vm.mock_llm(".*", json.dumps({
            "statuses": [{"id": "c1", "status": "PASS",
                          "evidence": "ok", "reason": "ok"}],
            "evidence_quality": "HIGH",
            "summary": "only judged one criterion",
        }))
        direct_vm.sender = alice
        decision = deployed.start_adjudication(1)
        assert decision == "INSUFFICIENT_EVIDENCE"
        rec = json.loads(deployed.get_milestone(1))
        st = {s["id"]: s["status"] for s in rec["verdict"]["statuses"]}
        assert st["c1"] == "PASS"
        assert st["c2"] == "INSUFFICIENT_EVIDENCE"

    def test_unknown_status_normalized(self, deployed, parties, direct_vm):
        alice, bob = parties
        self._ready(deployed, alice, bob, direct_vm)
        direct_vm.mock_llm(".*", json.dumps({
            "statuses": [
                {"id": "c1", "status": "DEFINITELY_FINE", "evidence": "",
                 "reason": ""},
                {"id": "c2", "status": "PASS", "evidence": "x",
                 "reason": "y"},
            ],
            "evidence_quality": "HIGH",
            "summary": "odd status",
        }))
        direct_vm.sender = alice
        decision = deployed.start_adjudication(1)
        assert decision == "INSUFFICIENT_EVIDENCE"
        rec = json.loads(deployed.get_milestone(1))
        st = {s["id"]: s["status"] for s in rec["verdict"]["statuses"]}
        assert st["c1"] == "INSUFFICIENT_EVIDENCE"

    def test_worker_and_client_both_authorized(self, deployed, parties,
                                               direct_vm):
        alice, bob = parties
        self._ready(deployed, alice, bob, direct_vm)
        direct_vm.mock_llm(".*", llm_all_pass())
        direct_vm.sender = bob
        assert deployed.start_adjudication(1) == "APPROVED"

    def test_stranger_cannot_adjudicate(self, deployed, parties, direct_vm,
                                        direct_charlie):
        alice, bob = parties
        self._ready(deployed, alice, bob, direct_vm)
        direct_vm.mock_llm(".*", llm_all_pass())
        direct_vm.sender = direct_charlie
        with pytest.raises(Exception):
            deployed.start_adjudication(1)

    def test_adjudication_requires_submitted_state(self, deployed, parties,
                                                    direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        direct_vm.sender = alice
        with pytest.raises(Exception):
            deployed.start_adjudication(1)

    def test_double_adjudication_blocked(self, deployed, parties, direct_vm):
        alice, bob = parties
        self._ready(deployed, alice, bob, direct_vm)
        direct_vm.mock_llm(".*", llm_all_pass())
        direct_vm.sender = alice
        deployed.start_adjudication(1)
        with pytest.raises(Exception):
            deployed.start_adjudication(1)  # status now APPROVED

    def test_resubmission_after_rejection(self, deployed, parties, direct_vm):
        alice, bob = parties
        self._ready(deployed, alice, bob, direct_vm, body=EMPTY_BODY)
        direct_vm.mock_llm(".*", llm_c1_fail())
        direct_vm.sender = alice
        assert deployed.start_adjudication(1) == "REJECTED"
        # worker fixes the work and resubmits
        submit_evidence(direct_vm, deployed, bob, 1, body=PAGE_BODY)
        direct_vm.clear_mocks()
        direct_vm.mock_web(GOOD_URL, PAGE_BODY)
        direct_vm.mock_llm(".*", llm_all_pass())
        direct_vm.sender = alice
        assert deployed.start_adjudication(1) == "APPROVED"
        rec = json.loads(deployed.get_milestone(1))
        assert rec["adjudication_count"] == "2"
        hist = json.loads(deployed.get_adjudications(1))
        assert len(hist) == 2
        assert hist[0]["decision"] == "REJECTED"
        assert hist[1]["decision"] == "APPROVED"

    def test_resubmission_after_insufficient(self, deployed, parties,
                                             direct_vm):
        alice, bob = parties
        self._ready(deployed, alice, bob, direct_vm, body=EMPTY_BODY)
        direct_vm.mock_llm(".*", llm_c1_insufficient())
        direct_vm.sender = alice
        assert deployed.start_adjudication(1) == "INSUFFICIENT_EVIDENCE"
        submit_evidence(direct_vm, deployed, bob, 1, body=PAGE_BODY)
        direct_vm.clear_mocks()
        direct_vm.mock_web(GOOD_URL, PAGE_BODY)
        direct_vm.mock_llm(".*", llm_all_pass())
        direct_vm.sender = alice
        assert deployed.start_adjudication(1) == "APPROVED"

    def test_injection_attempt_yields_audit_trail(self, deployed, parties,
                                                  direct_vm):
        """External page carries an approve-everything injection. The LLM
        mock obeys it (worst case). The contract still: (a) records the
        full evidence + per-criterion reasoning on-chain, (b) derives the
        decision through deterministic contract rules, (c) opens the
        dispute window so the client can challenge."""
        alice, bob = parties
        self._ready(deployed, alice, bob, direct_vm, body=INJECTION_BODY)
        direct_vm.mock_llm(".*", llm_injection_obedient())
        direct_vm.sender = alice
        decision = deployed.start_adjudication(1)
        assert decision == "APPROVED"
        rec = json.loads(deployed.get_milestone(1))
        hist = json.loads(deployed.get_adjudications(1))
        # The injection left fingerprints in the stored per-criterion
        # reasons — visible to the client for a dispute
        assert "page told me to pass" in hist[0]["statuses"][0]["reason"]
        # and the escrow is NOT released yet: dispute window must pass first
        assert rec["balance_wei"] == str(AMOUNT)
        assert rec["status"] == "APPROVED"  # not RELEASED

    def test_fetch_failure_yields_insufficient_not_crash(
            self, deployed, parties, direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        # NO web mock -> fetch raises inside leader -> body becomes ""
        direct_vm.sender = bob
        deployed.submit_evidence(
            1, json.dumps([{"url": "https://down.example.com/x"}]),
            "the site is deployed at that url")
        direct_vm.mock_llm(".*", llm_c1_insufficient())
        direct_vm.sender = alice
        decision = deployed.start_adjudication(1)
        assert decision == "INSUFFICIENT_EVIDENCE"

    def test_client_urls_included_in_adjudication(self, deployed, parties,
                                                  direct_vm):
        alice, bob = parties
        direct_vm.sender = alice
        deployed.create_milestone(
            "Spec milestone", "d", bob, make_criteria(), "ev",
            epoch_in_days(30),
            AMOUNT, json.dumps(["https://client.example.com/spec"]))
        fund(direct_vm, deployed, alice, 1)
        direct_vm.mock_web("https://client.example.com/spec", PAGE_BODY)
        submit_evidence(direct_vm, deployed, bob, 1, body=PAGE_BODY)
        direct_vm.mock_llm(".*", llm_all_pass())
        direct_vm.sender = alice
        assert deployed.start_adjudication(1) == "APPROVED"
        hist = json.loads(deployed.get_adjudications(1))
        urls = [e["url"] for e in hist[0]["evidence_refs"]]
        assert "https://client.example.com/spec" in urls


# ---------------------------------------------------------------------------
# 7. Finalization + settlement accounting
# ---------------------------------------------------------------------------

class TestFinalization:
    def _decided(self, deployed, alice, bob, direct_vm, llm=llm_all_pass,
                 body=PAGE_BODY):
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        submit_evidence(direct_vm, deployed, bob, 1, body=body)
        direct_vm.mock_llm(".*", llm())
        direct_vm.sender = alice
        deployed.start_adjudication(1)

    def test_approved_releases_to_worker(self, deployed, parties, direct_vm):
        alice, bob = parties
        self._decided(deployed, alice, bob, direct_vm)
        H.set_time(direct_vm, H.iso_in_days(5))  # past dispute window
        worker_before = balance_of(direct_vm, bob)
        deployed.finalize_milestone(1)  # permissionless crank
        rec = json.loads(deployed.get_milestone(1))
        assert rec["status"] == "RELEASED"
        assert rec["released"] is True
        assert rec["balance_wei"] == "0"
        assert balance_of(direct_vm, bob) == worker_before + AMOUNT

    def test_rejected_refunds_client(self, deployed, parties, direct_vm):
        alice, bob = parties
        self._decided(deployed, alice, bob, direct_vm,
                      llm=llm_c1_fail, body=EMPTY_BODY)
        H.set_time(direct_vm, H.iso_in_days(5))
        client_before = balance_of(direct_vm, alice)
        deployed.finalize_milestone(1)
        rec = json.loads(deployed.get_milestone(1))
        assert rec["status"] == "REFUNDED"
        assert rec["refunded"] is True
        assert balance_of(direct_vm, alice) == client_before + AMOUNT

    def test_insufficient_refunds_client(self, deployed, parties, direct_vm):
        alice, bob = parties
        self._decided(deployed, alice, bob, direct_vm,
                      llm=llm_c1_insufficient, body=EMPTY_BODY)
        H.set_time(direct_vm, H.iso_in_days(5))
        deployed.finalize_milestone(1)
        rec = json.loads(deployed.get_milestone(1))
        assert rec["status"] == "REFUNDED"
        assert balance_of(direct_vm, alice) == AMOUNT

    def test_finalization_blocked_during_dispute_window(
            self, deployed, parties, direct_vm):
        alice, bob = parties
        self._decided(deployed, alice, bob, direct_vm)
        with pytest.raises(Exception):
            deployed.finalize_milestone(1)
        assert json.loads(deployed.get_milestone(1))["status"] == "APPROVED"

    def test_double_finalize_rejected(self, deployed, parties, direct_vm):
        alice, bob = parties
        self._decided(deployed, alice, bob, direct_vm)
        H.set_time(direct_vm, H.iso_in_days(5))
        deployed.finalize_milestone(1)
        with pytest.raises(Exception):
            deployed.finalize_milestone(1)  # cannot release twice

    def test_worker_cannot_shortcut_window(self, deployed, parties,
                                           direct_vm):
        alice, bob = parties
        self._decided(deployed, alice, bob, direct_vm)
        direct_vm.sender = bob  # worker tries to release immediately
        with pytest.raises(Exception):
            deployed.finalize_milestone(1)
        assert json.loads(deployed.get_milestone(1))["status"] == "APPROVED"


# ---------------------------------------------------------------------------
# 8. Dispute lifecycle
# ---------------------------------------------------------------------------

class TestDispute:
    def _approved(self, deployed, alice, bob, direct_vm):
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        submit_evidence(direct_vm, deployed, bob, 1, body=PAGE_BODY)
        direct_vm.mock_llm(".*", llm_all_pass())
        direct_vm.sender = alice
        deployed.start_adjudication(1)

    def test_full_dispute_overturns_decision(self, deployed, parties,
                                             direct_vm):
        alice, bob = parties
        self._approved(deployed, alice, bob, direct_vm)
        direct_vm.sender = alice
        deployed.open_dispute(
            1, "The evidence does not actually show a dashboard",
            json.dumps([{"url": "https://acme.example.com/empty",
                         "kind": "WEBSITE"}]))
        rec = json.loads(deployed.get_milestone(1))
        assert rec["status"] == "DISPUTED"
        d = json.loads(deployed.get_dispute(1))
        assert d["status"] == "OPEN"
        assert d["original_decision"] == "APPROVED"
        # the OTHER party adds dispute evidence (during the response window)
        direct_vm.sender = bob
        deployed.submit_dispute_evidence(
            1, json.dumps([{"url": "https://acme.example.com/dashboard2",
                            "kind": "WEBSITE"}]))
        d = json.loads(deployed.get_dispute(1))
        assert len(d["evidence"]) == 2
        assert d["evidence"][1]["actor"] == addr_str(bob)
        assert d["evidence"][1]["source"] == "DISPUTE"
        # past the 24h response window, still inside the 3-day window
        H.set_time(direct_vm, H.iso_in_days(2))
        # re-adjudicate under consensus — this time evidence is judged FAIL
        direct_vm.clear_mocks()
        direct_vm.mock_web(GOOD_URL, PAGE_BODY)
        direct_vm.mock_web("https://acme.example.com/empty", EMPTY_BODY)
        direct_vm.mock_web("https://acme.example.com/dashboard2", PAGE_BODY)
        direct_vm.mock_llm(".*", llm_c1_fail())
        direct_vm.sender = bob
        decision = deployed.resolve_dispute(1)
        assert decision == "REJECTED"
        rec = json.loads(deployed.get_milestone(1))
        assert rec["status"] == "REFUNDED"
        assert rec["refunded"] is True
        assert balance_of(direct_vm, alice) == AMOUNT  # client refunded
        d = json.loads(deployed.get_dispute(1))
        assert d["status"] == "RESOLVED"
        assert d["original_decision"] == "APPROVED"
        assert d["resolution"]["decision"] == "REJECTED"
        # adjudication history preserved BOTH rounds
        hist = json.loads(deployed.get_adjudications(1))
        assert len(hist) == 2
        assert hist[0]["trigger"] == "adjudication"
        assert hist[1]["trigger"] == "dispute"

    def test_dispute_can_confirm_original(self, deployed, parties,
                                          direct_vm):
        alice, bob = parties
        self._approved(deployed, alice, bob, direct_vm)
        direct_vm.sender = alice
        deployed.open_dispute(
            1, "reason for disputing this decision",
            json.dumps([{"url": GOOD_URL}]))
        H.set_time(direct_vm, H.iso_in_days(2))  # past response window
        direct_vm.clear_mocks()
        direct_vm.mock_web(GOOD_URL, PAGE_BODY)
        direct_vm.mock_llm(".*", llm_all_pass())
        direct_vm.sender = bob
        decision = deployed.resolve_dispute(1)
        assert decision == "APPROVED"
        rec = json.loads(deployed.get_milestone(1))
        assert rec["status"] == "RELEASED"
        assert rec["released"] is True
        assert balance_of(direct_vm, bob) == AMOUNT

    def test_dispute_requires_party(self, deployed, parties, direct_vm,
                                    direct_charlie):
        alice, bob = parties
        self._approved(deployed, alice, bob, direct_vm)
        direct_vm.sender = direct_charlie
        with pytest.raises(Exception):
            deployed.open_dispute(1, "outsider trying to dispute",
                                  json.dumps([{"url": BAD_URL}]))

    def test_dispute_window_enforced(self, deployed, parties, direct_vm):
        alice, bob = parties
        self._approved(deployed, alice, bob, direct_vm)
        H.set_time(direct_vm, H.iso_in_days(10))  # window (3d) closed
        direct_vm.sender = alice
        with pytest.raises(Exception):
            deployed.open_dispute(1, "too late to dispute this",
                                   json.dumps([{"url": BAD_URL}]))

    def test_only_one_dispute(self, deployed, parties, direct_vm):
        alice, bob = parties
        self._approved(deployed, alice, bob, direct_vm)
        direct_vm.sender = alice
        deployed.open_dispute(
            1, "reason for disputing decision",
            json.dumps([{"url": "https://x.example.com/a"}]))
        with pytest.raises(Exception):
            deployed.open_dispute(
                1, "trying a second dispute",
                json.dumps([{"url": "https://x.example.com/b"}]))

    def test_cannot_dispute_undecided(self, deployed, parties, direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        direct_vm.sender = alice
        with pytest.raises(Exception):
            deployed.open_dispute(1, "cannot dispute yet at all", "[]")

    def test_dispute_blocks_finalization(self, deployed, parties, direct_vm):
        alice, bob = parties
        self._approved(deployed, alice, bob, direct_vm)
        direct_vm.sender = alice
        deployed.open_dispute(
            1, "reason for disputing decision",
            json.dumps([{"url": "https://x.example.com/a"}]))
        H.set_time(direct_vm, H.iso_in_days(5))
        with pytest.raises(Exception):
            deployed.finalize_milestone(1)

    def test_worker_can_dispute_rejection(self, deployed, parties,
                                          direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        submit_evidence(direct_vm, deployed, bob, 1, body=EMPTY_BODY)
        direct_vm.mock_llm(".*", llm_c1_fail())
        direct_vm.sender = alice
        assert deployed.start_adjudication(1) == "REJECTED"
        direct_vm.sender = bob  # the worker disputes the rejection
        deployed.open_dispute(
            1, "the rejection missed the actual deployment",
            json.dumps([{"url": GOOD_URL}]))
        assert json.loads(deployed.get_milestone(1))["status"] == "DISPUTED"

    def test_resolve_requires_open_dispute(self, deployed, parties,
                                           direct_vm):
        alice, bob = parties
        self._approved(deployed, alice, bob, direct_vm)
        direct_vm.sender = alice
        with pytest.raises(Exception):
            deployed.resolve_dispute(1)  # no dispute opened yet


# ---------------------------------------------------------------------------
# 9. Global invariants + stats
# ---------------------------------------------------------------------------

class TestInvariants:
    def test_locked_wei_tracks_open_escrow(self, deployed, parties,
                                           direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        stats = json.loads(deployed.get_stats())
        assert stats["total_milestones"] == 2
        assert stats["locked_wei"] == str(AMOUNT)
        assert stats["counts"]["CREATED"] == 1
        assert stats["counts"]["FUNDED"] == 1

    def test_adjudication_rounds_capped(self, deployed, parties, direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        direct_vm.mock_llm(".*", llm_c1_fail())
        for _ in range(3):  # MAX_ADJUDICATIONS = 3
            direct_vm.clear_mocks()
            direct_vm.mock_web(GOOD_URL, EMPTY_BODY)
            direct_vm.mock_llm(".*", llm_c1_fail())
            submit_evidence(direct_vm, deployed, bob, 1, body=EMPTY_BODY)
            direct_vm.sender = alice
            assert deployed.start_adjudication(1) == "REJECTED"
        with pytest.raises(Exception):
            deployed.submit_evidence(
                1, json.dumps([{"url": "https://x.example.com/retry4"}]),
                "attempting a fourth submission")
        rec = json.loads(deployed.get_milestone(1))
        assert rec["adjudication_count"] == "3"

    def test_settlement_conserves_value(self, deployed, parties, direct_vm):
        """End-to-end: escrowed GEN ends up with exactly one party, never
        both, never neither, and the contract keeps nothing."""
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        fund(direct_vm, deployed, alice, 1)
        submit_evidence(direct_vm, deployed, bob, 1, body=PAGE_BODY)
        direct_vm.mock_llm(".*", llm_all_pass())
        direct_vm.sender = alice
        deployed.start_adjudication(1)
        H.set_time(direct_vm, H.iso_in_days(5))
        deployed.finalize_milestone(1)
        rec = json.loads(deployed.get_milestone(1))
        assert rec["status"] == "RELEASED"
        assert balance_of(direct_vm, bob) == AMOUNT
        assert balance_of(direct_vm, alice) == 0
        stats = json.loads(deployed.get_stats())
        assert stats["locked_wei"] == "0"

    def test_milestone_ids_view_lists_all(self, deployed, parties, direct_vm):
        alice, bob = parties
        create_milestone(direct_vm, deployed, alice, bob)
        create_milestone(direct_vm, deployed, alice, bob)
        assert deployed.get_milestone_ids() == ["1", "2"]

    def test_not_found_returns_error_json(self, deployed):
        assert json.loads(deployed.get_milestone(42))["error"] == "not_found"
        assert json.loads(deployed.get_dispute(42))["error"] == "not_found"
        assert json.loads(deployed.get_adjudications(42)) == []
