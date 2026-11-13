const fs = require("fs");
const file = "/app/node_modules/next/dist/compiled/@next/font/dist/google/loader.js";
if (fs.existsSync(file)) {
  let code = fs.readFileSync(file, "utf8");
  const target = "const ext = /\\.(woff|woff2|eot|ttf|otf)$/.exec(googleFontFileUrl)[1];";
  const replacement = "const extMatch = /\\.(woff2?|eot|ttf|otf)/i.exec(googleFontFileUrl); const ext = extMatch ? extMatch[1] : 'woff2';";
  if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync(file, code, "utf8");
    console.log("Successfully patched Next.js font loader regex.");
  } else {
    console.log("Font loader already patched or target pattern not found.");
  }
}
