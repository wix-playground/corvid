const loadEditor = require("@wix/fake-local-mode-editor/src/editor");
const eventually = require("@wix/wix-eventually");
const merge_ = require("lodash/merge");
const localServer = require("../../src/server");
const localSiteDir = require("../utils/localSiteDir");
const lsc = require("../utils/localSiteCreators");
const sc = require("../utils/siteCreators");

describe("edit mode", () => {
  it("should not start the server in edit mode if the site directory is empty", async () => {
    const localSiteFiles = {};

    const localSitePath = await localSiteDir.initLocalSite(localSiteFiles);

    const server = localServer.startInEditMode(localSitePath);

    await expect(server).rejects.toThrow("CAN_NOT_EDIT_EMPTY_SITE");
  });
  it("should send code files to the editor on load", async () => {
    const localSiteFiles = lsc.createFull(
      lsc.publicCode("public-file.json", "public code"),
      lsc.backendCode("sub-folder/backendFile.jsw", "backend code")
    );

    const localSitePath = await localSiteDir.initLocalSite(localSiteFiles);
    const server = await localServer.startInEditMode(localSitePath);
    const editor = await loadEditor(server.port);

    const codeFiles = await editor.getCodeFiles();
    expect(codeFiles).toEqual(
      sc.createPartial(
        sc.publicCode("public-file.json", "public code"),
        sc.backendCode("sub-folder/backendFile.jsw", "backend code")
      )
    );

    await editor.close();
    await server.close();
  });

  it("should send page code files to the editor on load", async () => {
    const localSiteFiles = lsc.createFull(
      lsc.page("page-1"),
      lsc.pageCode("page-1", "public code")
    );

    const localSitePath = await localSiteDir.initLocalSite(localSiteFiles);
    const server = await localServer.startInEditMode(localSitePath);
    const editor = await loadEditor(server.port);
    const codeFiles = await editor.getCodeFiles();
    expect(codeFiles).toEqual(
      sc.createPartial(sc.pageCode("page-1", "public code"))
    );

    await editor.close();
    await server.close();
  });
  it("should send site document to the editor on load", async () => {
    const siteParts = {
      page: "page-1",
      colors: "colors-content",
      fonts: "fonts-content",
      theme: "theme-content",
      topLevelStyles: "topLevelStyles-content",
      commonComponents: "commonComponents-content",
      menu: "menu-content",
      multilingualInfo: "multilingualInfo-content",
      siteInfo: "siteInfo-content",
      metadata: "metadata-content",
      extraData: {
        version: "version-content",
        seoStuff: "seoStuff-content"
      }
    };

    const localSiteFiles = lsc.createFull(
      ...Object.keys(siteParts).map(key => lsc[key](siteParts[key]))
    );

    const localSitePath = await localSiteDir.initLocalSite(localSiteFiles);
    const server = await localServer.startInEditMode(localSitePath);
    const editor = await loadEditor(server.port);

    const siteDocument = await editor.getSiteDocument();

    const expectSiteDocument = sc.createFull(
      ...Object.keys(siteParts).map(key => sc[key](siteParts[key]))
    );

    expect(siteDocument).toEqual(expectSiteDocument);

    await editor.close();
    await server.close();
  });

  it("should send updated site document when user changes page content from the editor and clicks save", async () => {
    const lightbox = {
      id: "lightBox1ID",
      options: { isPopUp: true, content: "lightBox1ID old content" }
    };
    const page1 = {
      id: "page1",
      options: {
        content: "page1 old content"
      }
    };
    const page2 = {
      id: "page2",
      options: {
        content: "page2 new content"
      }
    };

    const localSiteFiles = lsc.createFull(
      lsc.page(page1.id, page1.options),
      lsc.page(lightbox.id, lightbox.options)
    );

    const localSitePath = await localSiteDir.initLocalSite(localSiteFiles);
    const server = await localServer.startInEditMode(localSitePath);
    const editor = await loadEditor(server.port);

    const newDocument = editor.getSiteDocument();

    // edit existing pages
    newDocument.pages[page1.id].content = "page1 new content";
    newDocument.pages[lightbox.id].content = "lightBox1ID new content";

    // add new page from the editor
    merge_(newDocument, sc.page(page2.id, page2.options));

    editor.modifyDocument(newDocument);
    await editor.save();

    const localSiteDocument = await localSiteDir.readLocalSite(localSitePath);

    const expected = lsc.createPartial(
      lsc.page(page2.id, page2.options),
      lsc.page(page1.id, { content: "page1 new content" }),
      lsc.page(lightbox.id, {
        isPopUp: true,
        content: "lightBox1ID new content"
      })
    );

    expect(localSiteDocument).toMatchObject(expected);

    await editor.close();
    await server.close();
  });

  it("should update code files after editor changes and clicks save", async () => {
    const localSiteFiles = lsc.createFull(
      lsc.publicCode("public-file.json", "public code"),
      lsc.publicCode("public-file1.json", "public code 1"),
      lsc.backendCode("sub-folder/backendFile.jsw", "backend code")
    );

    const localSitePath = await localSiteDir.initLocalSite(localSiteFiles);
    const server = await localServer.startInEditMode(localSitePath);
    const editor = await loadEditor(server.port);

    editor.modifyCodeFile(
      "backend/authorization-config.json",
      "console.log('authorization-config')"
    );
    editor.deleteCodeFile("public/public-file1.json");
    editor.copyCodeFile(
      "public/public-file.json",
      "public/public-file-copied.json"
    );

    await editor.save();

    const expected = lsc.createPartial(
      lsc.publicCode("public-file.json", "public code"),
      lsc.backendCode("sub-folder/backendFile.jsw", "backend code"),
      lsc.backendCode(
        "authorization-config.json",
        "console.log('authorization-config')"
      )
    );

    const serverFiles = await localSiteDir.readLocalSite(localSitePath);

    expect(serverFiles).toMatchObject(expected);
    // make sure the deleted file is not exsit on the local file system
    expect(serverFiles).not.toMatchObject(
      lsc.publicCode("public/public-file1.json", "public code 1")
    );

    await editor.close();
    await server.close();
  });

  it("should update the editor when a new code file is added locally", async () => {
    const localSiteFiles = lsc.createFull(
      lsc.publicCode("public-file.json", "public code")
    );

    const localSitePath = await localSiteDir.initLocalSite(localSiteFiles);
    const server = await localServer.startInEditMode(localSitePath);
    const editor = await loadEditor(server.port);
    await localSiteDir.writeFile(
      localSitePath,
      "public/newFile.js",
      "test content"
    );

    await eventually(
      async () => {
        const codeFiles = await editor.getCodeFiles();
        const expected = sc.createPartial(
          sc.publicCode("public-file.json", "public code"),
          sc.publicCode("newFile.js", "test content")
        );
        expect(codeFiles).toMatchObject(expected);
      },
      { timeout: 3000 }
    );

    await editor.close();
    await server.close();
  });

  it("should update the editor when a code file is modified locally", async () => {
    const filename = "public-file.json";
    const newContent = "updated code file";
    const localSiteFiles = lsc.createFull(
      lsc.publicCode(filename, "public code")
    );
    const localSitePath = await localSiteDir.initLocalSite(localSiteFiles);

    const server = await localServer.startInEditMode(localSitePath);
    const editor = await loadEditor(server.port);

    await localSiteDir.writeFile(
      localSitePath,
      `public/${filename}`,
      newContent
    );

    await eventually(
      async () => {
        const codeFiles = await editor.getCodeFiles();
        const expected = sc.createPartial(sc.publicCode(filename, newContent));
        expect(codeFiles).toMatchObject(expected);
      },
      { timeout: 3000 }
    );

    await editor.close();
    await server.close();
  });

  it("should update the editor when a code file is deleted locally", async () => {
    const localSiteFiles = lsc.createFull(
      lsc.publicCode("public-file.json", "public code"),
      lsc.publicCode("public-file1.json", "public code 1")
    );

    const localSitePath = await localSiteDir.initLocalSite(localSiteFiles);
    const server = await localServer.startInEditMode(localSitePath);
    const editor = await loadEditor(server.port);

    await localSiteDir.deleteFile(localSitePath, "public/public-file.json");
    await eventually(
      async () => {
        const codeFiles = await editor.getCodeFiles();
        const expected = sc.publicCode("public-file.json", "public code");
        expect(codeFiles).not.toMatchObject(expected);
      },
      { timeout: 3000 }
    );

    await editor.close();
    await server.close();
  });
});