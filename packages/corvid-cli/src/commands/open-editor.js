/* eslint-disable no-console */
const fs = require("fs");
const process = require("process");
const chalk = require("chalk");
const { app } = require("electron");
const {
  openWindow,
  launch,
  killAllChildProcesses
} = require("../utils/electron");
const createSpinner = require("../utils/spinner");
const openEditorApp = require("../apps/open-editor");
const serverErrors = require("../utils/server-errors");
const sessionData = require("../utils/sessionData");
const { sendOpenEditorEvent } = require("../utils/bi");
const { readCorvidConfig } = require("../utils/corvid-config");

app &&
  app.on("ready", async () => {
    try {
      await openWindow(openEditorApp(), {
        show: true && !process.env.CORVID_FORCE_HEADLESS
      });
    } catch (exc) {
      process.exit(-1);
    }
  });

async function openEditorHandler(args) {
  const { login } = require("./login");
  const spinner = createSpinner();
  const directory = args.dir;
  await readCorvidConfig(directory);
  sessionData.on(["msid", "uuid"], (msid, uuid) =>
    sendOpenEditorEvent(msid, uuid)
  );

  try {
    fs.readdirSync(directory);
  } catch (exc) {
    throw new Error(`Directory ${directory} does not exist`);
  }
  await login(spinner);

  spinner.start(chalk.grey("Connecting to local server"));

  await new Promise((resolve, reject) => {
    process.on("exit", () => killAllChildProcesses());

    launch(
      __filename,
      {
        // TODO uncomment the following two option to spawn the app in the
        // background once the local server can be spawned in the background as
        // well
        //detached: true,
        //stdio: "ignore",
        cwd: directory,
        env: {
          ...process.env
        }
      },
      {
        localServerConnected: () => {
          spinner.start(chalk.grey("Waiting for editor to connect"));
        },
        editorConnected: () => {
          sessionData.callWithKeys(
            (msid, uuid) => sendOpenEditorEvent(msid, uuid, "success"),
            "msid",
            "uuid"
          );
          spinner.succeed(chalk.grey("Editor connected"));
          resolve();
        },
        error: error => {
          spinner.fail();
          sessionData.callWithKeys(
            (msid, uuid) => sendOpenEditorEvent(msid, uuid, "fail"),
            "msid",
            "uuid"
          );
          if (error in serverErrors) {
            reject(new Error(serverErrors[error]));
          } else {
            reject(new Error(error));
          }
        }
      }
    )
      .then(resolve, reject)
      .catch(e => spinner.fail(e.message));
  });

  spinner.stop();
}

module.exports = {
  command: "open-editor",
  describe: "launches the local editor to edit the local site",
  builder: {},
  handler: async args => {
    openEditorHandler(Object.assign({}, args, { dir: process.cwd() })).catch(
      error => {
        console.log(chalk.red(error.message));
        process.exit(-1);
      }
    );
  },
  openEditorHandler
};
