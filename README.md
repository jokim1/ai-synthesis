# ai-synthesis

*A [Claude Code](https://claude.com/claude-code) skill that runs a grounded, multi-model debate on one hard decision — and tells you honestly how much to trust the answer.*

`/ai-synthesis` is for decisions worth deliberating: architecture choices, RFC stress-tests, build-vs-buy, strategy calls, postmortems. It is **not** a quick lookup — a full run takes a few minutes and several model calls, on purpose.

## What it is

- **A structured decision debate, not a single answer.** Two *different* model families (Claude + OpenAI Codex) independently frame the problem and gather evidence, then argue it out — instead of one model role-playing four personas (which shares one set of blind spots).
- **Grounded, not vibes.** Every evidence claim carries a re-openable source — a URL, a file path with line numbers, or a quoted excerpt. Reasoning from training knowledge is allowed, but *labeled as such* — never dressed up as a fact.
- **Adversarial by design.** The model that did *not* write the synthesis attacks it; the synthesis is then revised in response. You see the strongest objection and whether it was conceded or rebutted.
- **Honest about confidence.** No authoritative "Confidence: High." You get a **decision-grade** vs **exploratory** tag plus the countable drivers behind it (how many cruxes are verified, whether an objection survived, how much rests on grounded evidence). When the evidence is thin, it leads with *what's missing to decide* instead of faking a confident answer.
- **Decision-relevant and legible.** The assumptions the answer hinges on (its **cruxes**), the capability-gaps, and the unresolved tensions are surfaced up front; the full debate is one command away.
- **It informs; you decide.** Warnings never block. The tool surfaces risk and limits and leaves the call to you.
- **Built-in honesty instruments.** Rate each run's usefulness, A/B the full ensemble against a cheap single-model baseline **blind**, and revisit past decisions to see whether they actually held up. Your ratings are logged to surface patterns — never optimized against.

## Requirements

- **[Claude Code](https://claude.com/claude-code)** — the skill runs inside it (the "host" model is the Claude you're already talking to).
- **[OpenAI Codex CLI](https://github.com/openai/codex)**, authenticated (`codex login`) — provides the second, genuinely-different model family. *Optional but recommended:* without it the skill still runs, but on a single model only (and labels its output single-model / exploratory accordingly).
- **python3** (standard library only — no `pip install` needed) for the small helper scripts.
- **git**, to clone the repo.

## Install

The skill lives in this repo: the `SKILL.md` orchestrator plus its `bin/`, `roles/`, and `schemas/` assets. Make it available to Claude Code by placing the folder under `~/.claude/skills/`. A **symlink of the whole folder** is recommended — the assets must sit next to `SKILL.md`, and a symlink keeps your install in sync with the repo.

```bash
# 1. Get the repo
git clone https://github.com/jokim1/ai-synthesis.git
cd ai-synthesis

# 2. Install as a personal Claude Code skill (symlink the whole folder)
mkdir -p ~/.claude/skills
ln -s "$(pwd)" ~/.claude/skills/ai-synthesis

# 3. (Recommended) enable the second model family
codex login

# 4. Verify: start a NEW Claude Code session (skills load at startup),
#    then type "/ai-synthesis" — it should autocomplete.
```

**Alternatives & maintenance**

- *Snapshot instead of live-sync:* `cp -R "$(pwd)" ~/.claude/skills/ai-synthesis` (you'll re-copy after repo updates).
- *Only inside one project:* symlink into that project instead — `ln -s "$(pwd)" /path/to/project/.claude/skills/ai-synthesis` — and `/ai-synthesis` is available only there.
- *Update a symlinked install:* just `git pull` in the repo — the skill is always current.
- *Remove it:* `rm ~/.claude/skills/ai-synthesis` (it's a symlink — your repo is untouched).

## Using it — an end-to-end walkthrough

1. **You hit a hard decision.** Say you're weighing whether to rewrite a hot path or scale out.

2. **Ask for a synthesis:**
   ```
   /ai-synthesis Our API's p99 latency is too high — rewrite the hot path in Rust, or add more replicas?
   ```
   Add your own materials as grounding if you have them:
   ```
   /ai-synthesis --context rfc.md --context perf-numbers.csv <your decision>
   ```

3. **It runs the debate** (a few minutes; progress is shown): the two model families diverge and gather cited evidence independently → the evidence is pooled into a shared ledger → they critique each other over that shared evidence → a recommendation is synthesized, made conditional on the cruxes → the *other* model attacks it → one revision pass.

4. **You get a synthesis-first answer**, in plain order:
   - The **recommendation** up front — or, when the evidence is thin, **"what's missing to decide"** plus a clearly-marked *best guess*.
   - A **`[decision-grade]`** or **`[exploratory]`** tag with a one-line reason.
   - The **cruxes** — the assumptions the recommendation hinges on — each marked ✅ verified / ⚠️ unverified, with how to check it.
   - Material **capability-gaps**, the **strongest objection** (conceded or rebutted), and any **unresolved tensions**.

5. **Go deeper if you want:** `/ai-synthesis expand` prints the full debate, evidence ledger, and adversarial exchange. Every run is saved to `./.ai-synthesis/sessions/` in your current project.

6. **Rate it** (your honest, perceived usefulness — logged, never gamed):
   ```
   /ai-synthesis rate 4 "new insight"
   ```

7. **Sanity-check the value, blind:**
   ```
   /ai-synthesis --compare <your decision>
   ```
   This runs the full ensemble *and* a fast single-model baseline, shows them to you as **Option A / Option B with no labels**, asks you to rate both, then reveals which was which — an honest test of whether the heavier process earned its cost on *this kind* of problem.

8. **Need a quick take instead of the full treatment?**
   ```
   /ai-synthesis --solo <your decision>
   ```
   One model, one pass — fast and cheap, honestly labeled single-model.

9. **Later, once the decision has played out, close the loop:**
   ```
   /ai-synthesis revisit <session-id>
   ```
   Record whether the recommendation held up and whether the cruxes were the ones that actually mattered. Over time, `/ai-synthesis revisit` (no id) shows a calibration picture — e.g. did the runs it called *decision-grade* actually hold up more than the *exploratory* ones?

## Commands

| Command | What it does |
|---|---|
| `/ai-synthesis <decision>` | Full multi-model synthesis |
| `/ai-synthesis --context <file> … <decision>` | Add your files as grounding |
| `/ai-synthesis --solo <decision>` | Fast single-model baseline |
| `/ai-synthesis --compare <decision>` | Blind A/B: full ensemble vs. solo, rate both |
| `/ai-synthesis rate <1-4> [why]` | Log how useful the last run was |
| `/ai-synthesis revisit [id]` | Record how a past decision held up + calibration view |
| `/ai-synthesis expand [round]` | Show the full debate / evidence / adversarial detail |
| `/ai-synthesis list` · `resume [id]` | Browse / reload past sessions |

## Good to know

- **It's a deep-analysis tool, by design.** A full run is several model calls over a few minutes — use it on decisions that deserve the deliberation, and reach for `--solo` when you don't.
- **Your sessions stay with you.** Markdown files in `./.ai-synthesis/sessions/` (project-local, git-ignored by default) — readable by you and re-loadable by the skill. Run your decisions from a consistent working directory if you want ratings and revisits to accumulate into one calibration picture.
- **Honesty is the whole point.** Ratings and outcomes are logged to surface patterns *to you*; they are never used to tune the output toward higher scores. The tool's job is to inform your judgment, not to flatter it.
