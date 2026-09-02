# Integration tests (Studio / GLSim)

These require a running GenLayer node:

- GLSim (lightweight):  `.venv/bin/glsim --port 4000`
- Local Studio:          `npm install -g genlayer && genlayer up`
- Studionet:             https://studio.genlayer.com

Then run with gltest's Studio-mode runner:

    .venv/bin/gltest tests/integration/ -v -s

Live smoke (deploy + 3x determinism + negative case) is scripted in
`scripts/deploy_smoke_studionet.py` — see docs/testing.md.
