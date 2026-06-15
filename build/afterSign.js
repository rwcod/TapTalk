const { execSync, execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");

exports.default = async function afterSign(context) {
  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );
  const entitlements = path.resolve(__dirname, "entitlements.mac.plist");

  const macKeyServerInApp = path.join(
    appPath,
    "Contents/Resources/app.asar.unpacked/node_modules/keyspy/runtime/MacKeyServer"
  );
  const macKeyServerOriginal = path.resolve(
    __dirname,
    "../node_modules/keyspy/runtime/MacKeyServer"
  );

  if (fs.existsSync(macKeyServerOriginal) && fs.existsSync(macKeyServerInApp)) {
    console.log("Restoring original MacKeyServer binary (preserving cdhash)");
    fs.copyFileSync(macKeyServerOriginal, macKeyServerInApp);
  }

  const pasteHelperInApp = path.join(appPath, "Contents", "Resources", "native", "PasteHelper");
  if (fs.existsSync(pasteHelperInApp)) {
    console.log(`Signing PasteHelper: ${pasteHelperInApp}`);
    execFileSync(
      "codesign",
      ["--force", "--sign", "-", "--options", "runtime", "--entitlements", entitlements, pasteHelperInApp],
      { stdio: "inherit" }
    );
  }

  const frameworksDir = path.join(appPath, "Contents", "Frameworks");
  if (fs.existsSync(frameworksDir)) {
    const items = fs.readdirSync(frameworksDir);
    for (const item of items) {
      const itemPath = path.join(frameworksDir, item);
      console.log(`Re-signing framework: ${item}`);
      execSync(`codesign --force --sign - "${itemPath}"`, { stdio: "inherit" });
    }
  }

  console.log(`Re-signing app bundle (without --deep): ${appPath}`);
  execSync(
    `codesign --force --sign - --entitlements "${entitlements}" "${appPath}"`,
    { stdio: "inherit" }
  );
};
