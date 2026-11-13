// Commander treats packaged Electron argv differently from regular Node argv.
// In ELECTRON_RUN_AS_NODE mode our entry script is still present in argv[1].
process.defaultApp = true;
require(process.env.PINK_CLI_ENTRY);
