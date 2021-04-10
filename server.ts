import { serve } from "https://deno.land/std@0.92.0/http/server.ts";

import { walk } from "https://deno.land/std/fs/walk.ts";
import { posix } from "https://deno.land/std@0.86.0/path/mod.ts";
import { Tar } from "https://deno.land/std@0.86.0/archive/tar.ts";

const server = serve({ hostname: "0.0.0.0", port: 8080 });
console.log(`HTTP webserver running.  Access it at:  http://localhost:8080/`);

for await (const request of server) {
  if (request.method != "GET") {
    request.respond({ status: 400, body: "Only GET requests are supported" });
    continue;
  }

  // make path local
  const path = {
    localPath: "." + request.url,
    webPath: (!request.url.endsWith("/")) ? request.url + "/" : request.url,
  };

  // from the frontend
  if (path.localPath.endsWith(".tar?download")) {
    const dir = path.localPath.replace(/.tar\?download$/, "");
    const dirTarPath = await createTar(dir);
    const headers = new Headers();
    headers.set("Access-Control-Allow-Origin", "*");

    request.respond({
      status: 200,
      headers,
      body: Deno.readTextFileSync(dirTarPath),
    });
  } // from the browser
  else {
    const type = await Deno.stat(path.localPath);
    if (type.isDirectory) {
      const bodyContent = await writeToPage(path);
      const response = { status: 200, body: bodyContent };
      request.respond(response);
    } else {
      request.respond({
        status: 200,
        body: Deno.readTextFileSync(path.localPath),
      });
    }
  }
}

/// Assumption: initial path must be a dir
async function writeToPage(
  path: { localPath: string; webPath: string },
): Promise<string> {
  const bodyContent: string[] = [];
  if (path.webPath != "/") {
    bodyContent.push(`<li><a href="${path.webPath}..">../</a></li>`);
  }

  for await (const entry of Deno.readDir(path.localPath)) {
    const entryPath = path.webPath + entry.name;
    const name = posix.basename(entryPath);

    if (entry.isDirectory) {
      bodyContent.push(
        `<li><a href=${entryPath}>${name}</a>  <button OnClick=download("${name}");>download</button></li>`,
      );
    } else {
      // file
      bodyContent.push(`<li><a href=${entryPath}>${name}</a></li>`);
    }
  }

  const index = Deno.readTextFileSync("./index.html");
  const end = "</body></html>";

  return `${index}<ul>${bodyContent.join("<br/>")}</ul>${end}`;
}

async function createTar(dir: string): Promise<string> {
  const tar = new Tar();

  for await (const entry of walk(dir)) {
    await tar.append(entry.path, {
      filePath: entry.path,
    });
  }
  const dirTarPath = "/tmp/" + posix.basename(dir) + ".tar";
  const writer = await Deno.open(dirTarPath, {
    write: true,
    create: true,
  });
  await Deno.copy(tar.getReader(), writer);
  writer.close();
  return dirTarPath;
}
