/* eslint-disable no-console */
const chalk = require("chalk");
const { app, BrowserWindow } = require("electron");
const { launch } = require("../utils/electron");
const createSpinner = require("../utils/spinner");
const getMessage = require("../messages");

app &&
  app.on("ready", async () => {
    try {
      const win = new BrowserWindow({
        width: 1280,
        height: 960,
        show: false,
        webPreferences: { nodeIntegration: false }
      });

      await new Promise(resolve => {
        win.webContents.session.clearStorageData(() => {
          resolve();
        });
      });

      win.close();
    } catch (exc) {
      console.log(exc);
      process.exit(-1);
    }
  });

module.exports = {
  command: "logout",
  describe: getMessage("Logout_Command_Description"),
  handler: () => {
    const spinner = createSpinner();
    spinner.start(chalk.grey(getMessage("Logout_Command_Clearing")));

    launch(__filename).then(() => {
      spinner.succeed(chalk.grey(getMessage("Logout_Command_Cleared")));
    });
  }
};
