const fs = require("fs-extra");
const get_ = require("lodash/get");
const mapValues_ = require("lodash/mapValues");
const merge_ = require("lodash/merge");
const mapKeys_ = require("lodash/mapKeys");
const pickBy_ = require("lodash/pickBy");
const rimraf = require("rimraf");
const path = require("path");
const sitePaths = require("./sitePaths");
const dirAsJson = require("@wix/dir-as-json");
const flat = require("flat");

const flatten = data => flat(data, { delimiter: path.sep, safe: true });

const removeFileExtension = filename => filename.replace(/\.[^/.]+$/, "");
const stringify = content => JSON.stringify(content, null, 2);

const readWrite = (siteRootPath, filesWatcher) => {
  const getCodeFiles = async (dirPath = siteRootPath) => {
    const siteDirJson = await dirAsJson.readDirToJson(dirPath);
    const flatDirFiles = mapKeys_(
      flatten(siteDirJson),
      (fileContent, filePath) => sitePaths.fromLocalCode(filePath)
    );
    return pickBy_(flatDirFiles, (content, path) => sitePaths.isCodeFile(path));
  };

  const getDocumentPartByKey = async partKey => {
    const partFullPath = fullPath(sitePaths[partKey]());
    let documentPart = {};

    if (await fs.exists(partFullPath)) {
      const folder = pickBy_(
        await dirAsJson.readDirToJson(partFullPath),
        (content, path) => sitePaths.isDocumentFile(path)
      );
      documentPart = mapKeys_(
        mapValues_(folder, JSON.parse),
        (pageValue, pageKey) => removeFileExtension(pageKey)
      );
    }
    return documentPart;
  };

  const getDocumentExtraData = async () => {
    const partFullPath = fullPath(sitePaths.extraData());
    let data = {};

    if (await fs.exists(partFullPath)) {
      data = JSON.parse(await fs.readFile(partFullPath, "utf8"));
    }
    return data;
  };

  const getSiteDocument = async () => {
    return {
      pages: merge_(
        await getDocumentPartByKey("pages"),
        await getDocumentPartByKey("lightboxes")
      ),
      styles: await getDocumentPartByKey("styles"),
      site: await getDocumentPartByKey("site"),
      extraData: await getDocumentExtraData()
    };
  };

  const payloadConvertors = {
    pages: pagePaylaod => {
      return Object.keys(pagePaylaod).map(pageId => {
        const isPopup = get_(pagePaylaod, [pageId, "isPopUp"]);
        return {
          path: isPopup
            ? sitePaths.lightboxes(pageId)
            : sitePaths.pages(pageId),
          content: pagePaylaod[pageId]
        };
      });
    },
    styles: stylesPayload => {
      return Object.keys(stylesPayload).map(keyName => {
        return {
          path: sitePaths.styles(keyName),
          content: stylesPayload[keyName]
        };
      });
    },
    site: sitePayload => {
      return Object.keys(sitePayload).map(keyName => {
        return {
          path: sitePaths.site(keyName),
          content: sitePayload[keyName]
        };
      });
    },
    extraData: extraDataPayload => {
      return [
        {
          path: sitePaths.extraData(),
          content: extraDataPayload
        }
      ];
    }
  };

  const deleteExistingFolders = async () => {
    if (await fs.exists(fullPath(sitePaths.extraData()))) {
      await fs.unlink(fullPath(sitePaths.extraData()));
    }

    await Promise.all([
      new Promise(resolve =>
        rimraf(
          sitePaths.getDocumentFolderRegex(fullPath(sitePaths.pages())),
          resolve
        )
      ),
      new Promise(resolve =>
        rimraf(
          sitePaths.getDocumentFolderRegex(fullPath(sitePaths.lightboxes())),
          resolve
        )
      ),
      new Promise(resolve =>
        rimraf(
          sitePaths.getDocumentFolderRegex(fullPath(sitePaths.styles())),
          resolve
        )
      ),
      new Promise(resolve =>
        rimraf(
          sitePaths.getDocumentFolderRegex(fullPath(sitePaths.site())),
          resolve
        )
      )
    ]);
  };

  const updateSiteDocument = async newDocumentPayload => {
    await deleteExistingFolders();
    // convert payload to filesToWrite
    const filesToWrite = Object.keys(newDocumentPayload).map(paylodKey => {
      return payloadConvertors[paylodKey](newDocumentPayload[paylodKey]);
    });

    // write all files to file system
    const filesPromises = [];
    filesToWrite.forEach(filesArray => {
      filesArray.forEach(file => {
        filesPromises.push(
          filesWatcher.ignoredWriteFile(file.path, stringify(file.content))
        );
      });
    });

    await Promise.all(filesPromises)
      .then(() =>
        // eslint-disable-next-line no-console
        console.log("Update document done")
      )
      // eslint-disable-next-line no-console
      .catch(() => console.log("Update document failed"));
  };

  const fullPath = filePath => path.resolve(siteRootPath, filePath);

  const updateCode = async updateRequest => {
    const { modifiedFiles, copiedFiles, deletedFiles } = updateRequest;
    try {
      const updates = Object.keys(modifiedFiles).map(filePath =>
        filesWatcher.ignoredWriteFile(
          sitePaths.toLocalCode(filePath),
          modifiedFiles[filePath]
        )
      );
      const copies = copiedFiles.map(({ sourcePath, targetPath }) =>
        filesWatcher.ignoredCopyFile(
          sitePaths.toLocalCode(sourcePath),
          sitePaths.toLocalCode(targetPath)
        )
      );
      const deletes = deletedFiles.map(filePath => {
        filesWatcher.ignoredDeleteFile(sitePaths.toLocalCode(filePath));
      });
      await Promise.all([...updates, ...copies, ...deletes])
        .then(() =>
          // eslint-disable-next-line no-console
          console.log("Update code done")
        )
        // eslint-disable-next-line no-console
        .catch(() => console.log("Update code failed"));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log("files save error", error);
    }
  };

  return {
    updateSiteDocument,
    getSiteDocument,
    getCodeFiles,
    updateCode
  };
};

module.exports = readWrite;
