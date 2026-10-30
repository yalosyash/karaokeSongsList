const fs = require("fs");
const src = fs.readFileSync("data.js", "utf8");
const arr = JSON.parse(src.slice(src.indexOf("["), src.lastIndexOf("]") + 1));
console.log("songs:", arr.length);
console.log("with verse:", arr.filter((s) => s.verse).length);
console.log("with chorus:", arr.filter((s) => s.chorus).length);
console.log(
  "favorites of data:",
  arr
    .filter((s) => s.alt && s.alt.length)
    .map((s) => s.title)
    .join(", "),
);
const cats = {};
arr.forEach((s) => (cats[s.category] = (cats[s.category] || 0) + 1));
console.log("categories:", cats);
