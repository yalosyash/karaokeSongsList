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
      'globalThis.fetch = async () => ({ ok: true, json: async () => ({ title: "Test Artist - New Song (Karaoke)" }) });',
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
      meta: [],
      lyrics: {},
      embeds: [],
    }))
      await put(`content/${name}.json`, JSON.stringify(data));
    await put(
      "scripts/fetch-lyrics.js",
      `import fs from 'node:fs';const id=process.argv.at(-1);fs.writeFileSync('content/lyrics.json',JSON.stringify({[id]:{verse:['Test line'],chorus:[]}}));`,
    );
    await put(
      "scripts/build-catalog.js",
      `import fs from 'node:fs';fs.mkdirSync('data',{recursive:true});fs.writeFileSync('data/catalog.js',fs.readFileSync('content/songs.json'));`,
    );
    await put(
      "scripts/dev-server.js",
      `console.log('http://localhost:12345');setInterval(()=>{},1000);`,
    );
    await put(
      "scripts/check-embeds.js",
      `import fs from 'node:fs';if(process.env.IMPORT_FAIL) process.exit(1);fs.writeFileSync('content/embeds.json',JSON.stringify([{id:process.argv.at(-1),status:'ok',error:null}]));`,
    );
    const execute = (args, fail = false) =>
      new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            "--import",
            pathToFileURL(path.join(root, "preload.mjs")).href,
            path.join(root, "tools/song-import/add-song.js"),
            ...args,
          ],
          {
            cwd: os.tmpdir(),
            env: { ...process.env, IMPORT_FAIL: fail ? "1" : "" },
            stdio: ["pipe", "pipe", "pipe"],
          },
        );
        let output = "",
          pending = "";
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error(`Import timed out: ${output}`));
        }, 15000);
        child.stdout.on("data", (chunk) => {
          output += chunk;
          pending += chunk;
          if (pending.endsWith(": ")) {
            pending = "";
            child.stdin.write("\n");
          }
        });
        child.stderr.on("data", (chunk) => {
          output += chunk;
        });
        child.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once("exit", (code) => {
          clearTimeout(timer);
          resolve({ code, output });
        });
      });
    const link = "https://youtu.be/newSong0001";
    const failed = await execute([link], true);
    assert.equal(failed.code, 1, failed.output);
    assert.match(failed.output, /--resume/);
    assert.equal((await read("content/songs.json")).length, 2);
    const resumed = await execute(["--resume", link]);
    assert.equal(resumed.code, 0, resumed.output);
    assert.match(resumed.output, /Добавлено в локальный каталог/);
    assert.equal((await read("content/songs.json")).length, 2);
    assert.equal((await read("content/meta.json")).length, 1);
    assert.equal((await read("content/embeds.json"))[0].status, "ok");
    assert.equal((await read("data/catalog.js")).length, 2);
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
