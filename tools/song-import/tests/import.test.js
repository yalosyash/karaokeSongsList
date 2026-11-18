import test from "node:test";
import assert from "node:assert/strict";
import { videoId, songName } from "../song-import.js";

test("YouTube links retain the video ID and ignore tracking parameters", () => {
  for (const link of [
    "https://www.youtube.com/watch?v=mlwGdezFEck&list=abc",
    "https://youtu.be/mlwGdezFEck?si=abc",
    "https://m.youtube.com/shorts/mlwGdezFEck",
    "https://www.youtube.com/embed/mlwGdezFEck",
    "https://youtube.com/live/mlwGdezFEck",
  ])
    assert.equal(videoId(link), "mlwGdezFEck");
});
test("Reject unrelated hosts, playlists and invalid IDs", () => {
  for (const link of [
    "https://evil.com/watch?v=mlwGdezFEck",
    "https://youtube.com.evil.com/watch?v=mlwGdezFEck",
    "https://youtube.com/playlist?list=abc",
    "https://youtu.be/abc",
    "file:///watch?v=mlwGdezFEck",
  ])
    assert.throws(() => videoId(link));
});
test("Extract artist and song while leaving ambiguous titles for confirmation", () => {
  assert.deepEqual(songName("Иван Дорн - Стыцамэн (Караоке)"), {
    artist: "Иван Дорн",
    title: "Стыцамэн",
  });
  assert.deepEqual(
    songName("Bonnie Tyler — Holding Out For A Hero (Karaoke Version)"),
    { artist: "Bonnie Tyler", title: "Holding Out For A Hero" },
  );
  assert.equal(
    songName("Караоке/Солнышко - Группа DEMO").artist,
    "Караоке/Солнышко",
  );
  assert.equal(songName("Some title without artist").artist, "");
});
