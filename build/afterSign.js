const { execFileSync, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

function signingIdentity(appPath) {
  const result = spawnSync("codesign", ["--display", "--verbose=4", appPath], {
    encoding: "utf8"
  });
  const details = `${result.stdout || ""}${result.stderr || ""}`;
  const match = details.match(/^Authority=(.+)$/m);
  return match && match[1] !== "(unavailable)" ? match[1] : "-";
}

function sign(target, identity, entitlements) {
  const args = ["--force", "--sign", identity, "--options", "runtime"];
  if (entitlements) {
    args.push("--entitlements", entitlements);
  }
  args.push(target);
  execFileSync("codesign", args, { stdio: "inherit" });
}

exports.default = async function afterSign(context) {
  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );
  const entitlements = path.resolve(__dirname, "entitlements.mac.plist");
  const identity = signingIdentity(appPath);

  const macKeyServerInApp = path.join(
    appPath,
    "Contents/Resources/app.asar.unpacked/node_modules/keyspy/runtime/MacKeyServer"
  );
  const macKeyServerOriginal = path.resolve(
    __dirname,
    "../node_modules/keyspy/runtime/MacKeyServer"
  );

  if (fs.existsSync(macKeyServerOriginal) && fs.existsSync(macKeyServerInApp)) {
    console.log("Restoring and signing original MacKeyServer binary");
    fs.copyFileSync(macKeyServerOriginal, macKeyServerInApp);
    sign(macKeyServerInApp, identity, entitlements);
  }

  const pasteHelperInApp = path.join(appPath, "Contents", "Resources", "native", "PasteHelper");
  if (fs.existsSync(pasteHelperInApp)) {
    console.log(`Signing PasteHelper: ${pasteHelperInApp}`);
    sign(pasteHelperInApp, identity, entitlements);
  }

  console.log(`Re-signing app bundle (without --deep): ${appPath}`);
  sign(appPath, identity, entitlements);
};
