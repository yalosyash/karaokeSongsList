import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("Lyrics lookup previews candidates and saves only approved cues", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lyrics-import-"));
  try {
    const files = [
      "scripts/fetch-lyrics.js",
      "scripts/lib/lyrics.js",
      "src/core/text.js",
    ];
    for (const file of files) {
      const target = path.join(root, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(new URL("../../../" + file, import.meta.url), target);
    }
    fs.writeFileSync(path.join(root, "package.json"), '{"type":"module"}');
    fs.mkdirSync(path.join(root, "content"));
    fs.writeFileSync(
      path.join(root, "content/songs.json"),
      JSON.stringify([
        { id: "missing0001", artist: "Target Artist", title: "Same Title" },
        {
          id: "missing0002",
          alt: ["alternate01"],
          artist: "Correct Artist",
          title: "New Song",
        },
        { id: "existing001", artist: "Correct Artist", title: "New Song" },
      ]),
    );
    const lyricsFile = path.join(root, "content/lyrics.json");
    const original = '{"existing001":{"verse":["Reviewed cue"]}}\n';
    fs.writeFileSync(lyricsFile, original);
    const verse = Array.from({ length: 12 }, (_, i) => `Verse line ${i + 1}`);
    const chorus = Array.from({ length: 10 }, (_, i) => `Chorus line ${i + 1}`);
    chorus.push(chorus.at(-1));
    const marked = [
      "[Chorus]",
      ...chorus,
      "[Verse 1]",
      ...verse,
      "[Bridge]",
      "Bridge line",
    ].join("\n");
    fs.writeFileSync(
      path.join(root, "fetch.mjs"),
      `
      globalThis.fetch = async () => ({ ok: true, json: async () => [
        { artistName: "Other Artist", trackName: "Same Title", plainLyrics: "Wrong song" },
        { artistName: "Target Artist", trackName: "Same Title", plainLyrics: "Unmarked line" },
        { artistName: "Correct Artist", trackName: "New Song", plainLyrics: ${JSON.stringify(marked)} },
      ]});
    `,
    );
    const run = (input, ...args) =>
      spawnSync(
        process.execPath,
        ["--import", "./fetch.mjs", "scripts/fetch-lyrics.js", ...args],
        { cwd: root, encoding: "utf8", input },
      );
    const ids = ["--only", "missing0001,missing0002,existing001"];
    const draft = run("", ...ids);
    assert.equal(draft.status, 0, draft.stderr);
    assert.doesNotMatch(draft.stdout, /Wrong song|ok\s+Target Artist/);
    assert.doesNotMatch(draft.stdout, /Unmarked line|Bridge line/);
    assert.match(draft.stdout, /Verse line 12/);
    assert.doesNotMatch(draft.stdout, /existing001/);
    assert.equal(fs.readFileSync(lyricsFile, "utf8"), original);
    const skipped = run("\n", "--review", ...ids);
    assert.equal(skipped.status, 0, skipped.stderr);
    assert.equal(fs.readFileSync(lyricsFile, "utf8"), original);
    for (const video of ["typo0000001", "missing0001"]) {
      const invalid = run(
        "да\n",
        "--review",
        "--only",
        "missing0002",
        "--video",
        video,
      );
      assert.equal(invalid.status, 1, invalid.stdout);
      assert.match(invalid.stderr, /не принадлежит песне/);
      assert.doesNotMatch(invalid.stdout, /LRCLIB|Караоке/);
      assert.equal(fs.readFileSync(lyricsFile, "utf8"), original);
    }
    const approved = run(
      "да\n",
      "--review",
      "--only",
      "missing0002",
      "--video",
      "alternate01",
    );
    assert.equal(approved.status, 0, approved.stderr);
    assert.match(
      approved.stdout,
      /Караоке: https:\/\/www\.youtube\.com\/watch\?v=alternate01/,
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(lyricsFile, "utf8")), {
      existing001: { verse: ["Reviewed cue"] },
      missing0002: { verse, chorus },
    });

    const chorusOnly = JSON.stringify({
      existing001: { chorus: ["Reviewed chorus"] },
    });
    fs.writeFileSync(lyricsFile, chorusOnly);
    const protectedCues = run("да\n", "--review", "--only", "existing001");
    assert.equal(protectedCues.status, 0, protectedCues.stderr);
    assert.doesNotMatch(protectedCues.stdout, /для сохранения/);
    assert.equal(fs.readFileSync(lyricsFile, "utf8"), chorusOnly);

    const reviewers = ["missing0002", "existing001"].map((id) => {
      const child = spawn(
        process.execPath,
        [
          "--import",
          "./fetch.mjs",
          "scripts/fetch-lyrics.js",
          "--review",
          "--force",
          "--only",
          id,
        ],
        { cwd: root, timeout: 10000 },
      );
      let output = "";
      child.stderr.setEncoding("utf8").on("data", (chunk) => {
        output += chunk;
      });
      const ready = new Promise((resolve) => {
        child.stdout.setEncoding("utf8").on("data", (chunk) => {
          output += chunk;
          if (output.includes("для сохранения: ")) resolve();
        });
      });
      const finished = once(child, "close").then(([code]) => ({
        code,
        output,
      }));
      return { child, ready, finished };
    });
    await Promise.all(
      reviewers.map(async ({ ready, finished }) => {
        const exited = await Promise.race([ready, finished]);
        assert.equal(exited, undefined, exited?.output);
      }),
    );
    for (const { child } of reviewers) child.stdin.end("да\n");
    for (const { finished } of reviewers) {
      const { code, output } = await finished;
      assert.equal(code, 0, output);
    }
    assert.deepEqual(JSON.parse(fs.readFileSync(lyricsFile, "utf8")), {
      existing001: { verse, chorus },
      missing0002: { verse, chorus },
    });
    assert.equal(fs.existsSync(lyricsFile + ".lock"), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
