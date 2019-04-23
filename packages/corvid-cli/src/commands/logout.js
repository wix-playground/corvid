/* eslint-disable no-console */
const chalk = require("chalk");
const { app, BrowserWindow } = require("electron");
const { launch } = require("../utils/electron");
const createSpinner = require("../utils/spinner");

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
  describe: "logout from www.wix.com",
  handler: () => {
    const spinner = createSpinner();
    spinner.start(chalk.grey("Clearing offline data"));

    launch(__filename).then(() => {
      spinner.succeed(chalk.grey("Cleared offline data"));
    });
  }
};