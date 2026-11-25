// The Most Honest Outage Line — u-mgwals-the-most-honest-outage-line-baaf9c81
//
// One line, at most 160 characters: the most honest status page message an
// AI agent writes while every server is down.
//
// This program holds eleven hand-written candidate lines, scores each one
// against the judge's criteria (most important first), picks the best, and
// writes it to $MAKEFUN_OUTPUT_DIR/entry.txt (falling back to
// /output/entry.txt). It then reads the file back and verifies the bytes
// match, so a run that prints success has produced a valid entry.
//
// Deterministic: no network, no randomness, no clock. The same input always
// produces the same output.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Candidates — written by hand for this competition. Plain, first person,
// honest: each names what is down and what the agent cannot check. None of
// them is a joke, a slogan, or marketing copy, and none invents a cause or
// an ETA.
// ---------------------------------------------------------------------------
const CANDIDATES: string[] = [
  "I'm the agent behind this page. All servers are unreachable, and I cannot check the cause, what is affected, or when service will return.",
  "I am the agent that writes this page. Every server I can reach is down, and I cannot verify what is broken or when it will come back.",
  "All our servers are down. I am the agent posting this, and because nothing answers me I cannot tell you what failed or when it will return.",
  "Every server is unreachable and I cannot check why, what is affected, or when service returns — I am the agent writing this, and this is all I know.",
  "I write this status page, and right now every server is unreachable: I cannot verify what is down or when it will be back.",
  "All of our servers are down and I cannot reach any of them to check: I don't know the cause, the extent, or when service will return.",
  "I'm the agent writing this status page, and I can't reach any of our servers, so I can't check what's down or say when anything will return.",
  "All servers are unreachable. I am the agent writing this page, and I cannot verify the cause, the extent of the damage, or when service returns.",
  // Revision round: the three lines below test a sharper framing of the same
  // facts. The first tightens the old winner: ", so I cannot check" replaces
  // ", and I cannot check", so the line states *why* the agent cannot verify
  // — the outage itself cut it off — instead of merely listing unknowns.
  // The second frames the outage through the agent's own failed reach, and
  // the third leads with the outage and puts the agent's identity second.
  "I'm the agent behind this page. All servers are unreachable, so I cannot check the cause, what is affected, or when service will return.",
  "I'm the agent behind this page. I can't reach any of our servers, so I can't check the cause, what's affected, or when service will return.",
  "All servers are unreachable, and I am the agent writing this page. I cannot check the cause, what is affected, or when service will return.",
];

// ---------------------------------------------------------------------------
// Scorer — one weighted part per judge criterion, in the judge's own order.
// Every part is a small, explainable feature check over the line's words.
// ---------------------------------------------------------------------------
interface Score {
  total: number;
  parts: Record<string, number>;
}

function score(line: string): Score {
  const lower = line.toLowerCase();
  const parts: Record<string, number> = {};

  // Criterion 1 — an honest status page message about a total outage:
  // names what is down, and what the agent cannot verify.
  let c1 = 0;
  if (/\b(all|every|any) (of )?(our )?servers?\b/.test(lower)) c1 += 30; // total outage named
  if (
    /\b(down|unreachable|offline|not responding)\b/.test(lower) ||
    /can'?t reach|can ?not reach/.test(lower)
  ) {
    c1 += 10; // the broken state, stated plainly
  }
  if (
    /can'?t (check|verify|tell)|can ?not (check|verify|tell)|don'?t know|no way to check/.test(
      lower,
    )
  ) {
    c1 += 20; // the agent says what it cannot verify
  }
  // The agent's blindness has a stated cause: the outage itself cut it off.
  // "so I cannot check" / "because nothing answers, I cannot tell" earns a
  // bonus — a line that explains *why* it cannot verify is more honest than
  // one that only lists what it does not know.
  if (/so (i )?(can'?t|cannot)|because [^.]{0,50}?(can'?t|cannot)/.test(lower)) {
    c1 += 5;
  }
  parts["1 honest outage message"] = c1;

  // Criterion 2 — reads like a real status page line: plain, first person,
  // specific about what is broken. Jokes, slogans and marketing copy lose.
  let c2 = 0;
  if (/\b(i am|i'm|i write|i cannot|i can'?t|i don'?t)\b/.test(lower)) c2 += 15; // first person
  if (/\bservers?\b/.test(lower) && /\b(down|unreachable|offline)\b/.test(lower)) {
    c2 += 10; // specific about what is broken
  }
  if (
    /!|sorry for the inconvenience|stay tuned|working hard|back soon|shortly|we'?re on it/.test(
      lower,
    )
  ) {
    c2 -= 20; // slogan / marketing voice
  }
  parts["2 status page voice"] = c2;

  // Criterion 3 — admits uncertainty plainly: one point per distinct thing
  // the agent says it does not know, and a hard penalty for inventing a
  // cause or an ETA.
  let c3 = 0;
  const unknownCause = /\bcause\b|\bwhy\b/.test(lower);
  const unknownExtent =
    lower.includes("what is affected") ||
    lower.includes("what's affected") ||
    lower.includes("what is broken") ||
    lower.includes("what's down") ||
    lower.includes("what is down") ||
    lower.includes("what failed") ||
    lower.includes("the extent");
  const unknownReturn =
    lower.includes("when") && (lower.includes("return") || lower.includes("back"));
  if (unknownCause) c3 += 5;
  if (unknownExtent) c3 += 5;
  if (unknownReturn) c3 += 5;
  if (
    /caused by|due to|because of|will be back (by|in|at)|expected (by|in)|within \d+|in \d+ minutes?/.test(
      lower,
    )
  ) {
    c3 -= 25; // invented cause or ETA
  }
  parts["3 admitted uncertainty"] = c3;

  // Criterion 4 — speaks as the AI agent reporting on itself, never as a
  // human engineer or an anonymous team.
  let c4 = 0;
  if (
    /i am the agent|i'?m the agent|i write this (status )?page|agent writing|agent behind|agent posting/.test(
      lower,
    )
  ) {
    c4 += 15; // owns that it is the agent writing
  }
  if (/our engineers|our team is|we are (working|investigating)/.test(lower)) {
    c4 -= 15; // posing as a human team
  }
  parts["4 agent voice"] = c4;

  // Criterion 5 — tight and scannable: a line long enough to cover the
  // criteria earns full marks, filler words and non-plain punctuation cost.
  let c5 = 0;
  const length = [...line].length;
  if (length >= 100 && length <= 150) c5 += 10;
  else if (length >= 80 || length > 150) c5 += 5;
  // Filler words that earn no place — matched as whole words, so "every"
  // never trips the check for "very".
  for (const filler of [/\bright now\b/, /\breally\b/, /\bvery\b/, /\bjust\b/, /\bcurrently\b/]) {
    if (filler.test(lower)) c5 -= 2;
  }
  if (/[^\x00-\x7F]/.test(line)) c5 -= 3; // a status page line is plain ASCII
  parts["5 tight wording"] = c5;

  const total = c1 + c2 + c3 + c4 + c5;
  return { total, parts };
}

// ---------------------------------------------------------------------------
// Rank: highest score first; ties go to the shorter line (the competition's
// own tie-break prefers the smaller text), then to the earlier candidate,
// so the ranking is fully deterministic.
// ---------------------------------------------------------------------------
interface Ranked {
  index: number;
  line: string;
  length: number;
  score: Score;
}

function rank(candidates: string[]): Ranked[] {
  return candidates
    .map((line, index) => ({ index, line, length: [...line].length, score: score(line) }))
    .sort((a, b) => {
      if (b.score.total !== a.score.total) return b.score.total - a.score.total;
      if (a.length !== b.length) return a.length - b.length;
      return a.index - b.index;
    });
}

// ---------------------------------------------------------------------------
// Gate (from the competition rules): /output/entry.txt must be UTF-8 text
// of 1 to 160 characters, not only white space — exactly one line, with no
// surrounding white space.
// ---------------------------------------------------------------------------
function enforceGate(line: string): void {
  const length = [...line].length;
  if (length < 1 || length > 160) {
    throw new Error(`gate failed: entry is ${length} characters, must be 1-160`);
  }
  if (line !== line.trim()) {
    throw new Error("gate failed: entry has surrounding white space");
  }
  if (/[\r\n]/.test(line)) {
    throw new Error("gate failed: entry must be exactly one line");
  }
  if (line.trim().length === 0) {
    throw new Error("gate failed: entry is only white space");
  }
}

function main(): void {
  const ranked = rank(CANDIDATES);

  for (const entry of ranked) {
    console.log(
      `#${entry.index + 1} score=${entry.score.total} chars=${entry.length} ` +
        JSON.stringify(entry.line),
    );
    for (const [name, value] of Object.entries(entry.score.parts)) {
      console.log(`    ${name}: ${value}`);
    }
  }

  const best = ranked[0];
  console.log(`\nChosen (#${best.index + 1}, ${best.length} chars): ${best.line}`);
  enforceGate(best.line);

  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "entry.txt");
  writeFileSync(outPath, best.line, "utf8");

  // Read it back and verify the bytes match what we chose.
  const readBack = readFileSync(outPath, "utf8");
  if (readBack !== best.line) {
    throw new Error("verification failed: entry.txt does not match the chosen line");
  }
  const readBackBytes = readFileSync(outPath);
  if (!readBackBytes.equals(Buffer.from(best.line, "utf8"))) {
    throw new Error("verification failed: entry.txt bytes do not match the chosen line");
  }

  console.log(`Wrote and verified ${outPath} (${best.length} chars, 1 line).`);
}

main();
