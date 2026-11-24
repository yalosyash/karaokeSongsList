import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

test("Import, reject duplicates and resume after a failed video check", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "song-import-"));
  const put = async (name, text) => {
    const target = path.join(root, name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, text);
  };
  const read = async (name) =>
    JSON.parse(await fs.readFile(path.join(root, name), "utf8"));
  try {
    for (const name of ["add-song.js", "song-import.js"])
      await put(
        `tools/song-import/${name}`,
        await fs.readFile(new URL(`../${name}`, import.meta.url)),
      );
    await put("package.json", '{"type":"module"}');
    await put(
      "tests/support.js",
      "export const chromePath = () => process.execPath;",
    );
    await put(
      "preload.mjs",
      `globalThis.fetch = async (url) => ({
        ok: true,
        json: async () => new URL(url).hostname === "lrclib.net"
          ? [{
              artistName: "Test Artist",
              trackName: "New Song",
              plainLyrics: "[Verse 1]\\nTest verse\\n[Chorus]\\nTest chorus",
            }]
          : { title: "Test Artist - New Song (Karaoke)" },
      });`,
    );
    await put(
      "content/songs.json",
      JSON.stringify([
        {
          id: "oldSong0001",
          artist: "Old",
          title: "Song",
          category: "Зарубежная музыка",
          genre: "Поп",
          lang: "en",
        },
      ]),
    );
    for (const [name, data] of Object.entries({
      lyrics: {},
      embeds: [],
    }))
      await put(`content/${name}.json`, JSON.stringify(data));
    for (const file of [
      "scripts/build-catalog.js",
      "scripts/fetch-lyrics.js",
      "scripts/lib/embeds.js",
      "scripts/lib/lyrics.js",
      "src/core/text.js",
    ]) {
      await put(
        file,
        await fs.readFile(new URL(`../../../${file}`, import.meta.url)),
      );
    }
    await put(
      "node_modules/prettier/package.json",
      '{"type":"module","exports":"./index.js"}',
    );
    await put(
      "node_modules/prettier/index.js",
      "export default { format: (source) => source };",
    );
    await put(
      "scripts/dev-server.js",
      `console.log('http://localhost:12345');setInterval(()=>{},1000);`,
    );
    await put(
      "scripts/check-embeds.js",
      `import fs from 'node:fs';if(process.env.IMPORT_FAIL) process.exit(1);fs.writeFileSync('content/embeds.json',JSON.stringify([{id:process.argv.at(-1),status:'ok',error:null}]));`,
    );
    const preload = pathToFileURL(path.join(root, "preload.mjs")).href;
    const execute = (args, fail = false, approveCues = false, beforeAnswer) =>
      new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [path.join(root, "tools/song-import/add-song.js"), ...args],
          {
            cwd: os.tmpdir(),
            env: {
              ...process.env,
              IMPORT_FAIL: fail ? "1" : "",
              NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import=${preload}`]
                .filter(Boolean)
                .join(" "),
            },
            stdio: ["pipe", "pipe", "pipe"],
          },
        );
        let output = "",
          pending = "";
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error(`Import timed out: ${output}`));
        }, 15000);
        child.stdout.on("data", async (chunk) => {
          output += chunk;
          pending += chunk;
          if (pending.endsWith(": ")) {
            const cuePrompt = /Сверили с караоке|для сохранения: /.test(
              pending,
            );
            const answer = approveCues && cuePrompt ? "да" : "";
            pending = "";
            if (cuePrompt && beforeAnswer) {
              try {
                await beforeAnswer();
              } catch (error) {
                child.kill();
                reject(error);
                return;
              }
            }
            child.stdin.write(answer + "\n");
          }
        });
        child.stderr.on("data", (chunk) => {
          output += chunk;
        });
        child.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once("close", (code) => {
          clearTimeout(timer);
          resolve({ code, output });
        });
      });
    const link = "https://youtu.be/newSong0001";
    const catalogPath = path.join(root, "data/catalog.js");
    const competingCues = {
      verse: ["Changed verse"],
      chorus: ["Changed chorus"],
    };
    const replaceLyrics = () =>
      put(
        "content/lyrics.json",
        JSON.stringify({ newSong0001: competingCues }),
      );
    for (const approve of [false, true]) {
      await put("content/lyrics.json", "{}");
      const result = await execute(
        approve ? ["--resume", link] : [link],
        false,
        approve,
        replaceLyrics,
      );
      assert.equal(result.code, 1, result.output);
      assert.match(
        result.output,
        approve ? /Подсказка изменилась во время проверки/ : /Пропущено/,
      );
      assert.match(result.output, /Подсказка не сохранена/);
      assert.deepEqual(
        (await read("content/lyrics.json")).newSong0001,
        competingCues,
      );
      await assert.rejects(fs.access(catalogPath), { code: "ENOENT" });
    }
    const chorusOnly = { newSong0001: { chorus: ["Saved chorus"] } };
    await put("content/lyrics.json", JSON.stringify(chorusOnly));
    const partial = await execute(["--resume", link], false, true);
    assert.equal(partial.code, 1, partial.output);
    assert.match(partial.output, /Добавьте полный куплет/);
    assert.deepEqual(await read("content/lyrics.json"), chorusOnly);

    await put("content/lyrics.json", "{}");
    const failed = await execute(["--resume", link], true, true);
    assert.equal(failed.code, 1, failed.output);
    assert.ok(
      failed.output.includes(
        'node tools/song-import/add-song.js --resume "https://www.youtube.com/watch?v=newSong0001"',
      ),
      failed.output,
    );
    assert.equal((await read("content/songs.json")).length, 2);
    const declined = await execute(["--resume", link]);
    assert.equal(declined.code, 1, declined.output);
    assert.match(declined.output, /Проверьте подсказки/);
    const before = await fs.readFile(catalogPath, "utf8");
    assert.match(before, /Test verse/);
    const changed = await execute(
      ["--resume", link],
      false,
      true,
      replaceLyrics,
    );
    assert.equal(changed.code, 1, changed.output);
    assert.match(changed.output, /Подсказка изменилась после сверки/);
    assert.equal(await fs.readFile(catalogPath, "utf8"), before);
    const resumed = await execute(["--resume", link], false, true);
    assert.equal(resumed.code, 0, resumed.output);
    assert.match(resumed.output, /Добавлено в локальный каталог/);
    assert.equal((await read("content/songs.json")).length, 2);
    assert.equal((await read("content/embeds.json"))[0].status, "ok");
    assert.match(await fs.readFile(catalogPath, "utf8"), /Changed verse/);
    const duplicate = await execute([link]);
    assert.equal(duplicate.code, 1);
    assert.match(duplicate.output, /уже есть/);
    assert.equal((await read("content/songs.json")).length, 2);
    const obsolete = await execute(["--publish", link]);
    assert.equal(obsolete.code, 1);
    assert.match(obsolete.output, /Неизвестный параметр/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
