import {
  serve,
  ServerRequest,
} from "https://deno.land/std@0.92.0/http/server.ts";

import { walk } from "https://deno.land/std/fs/walk.ts";
import { extname, posix } from "https://deno.land/std@0.86.0/path/mod.ts";
import { Tar } from "https://deno.land/std@0.86.0/archive/tar.ts";

const server = serve({ hostname: "0.0.0.0", port: 8080 });
console.log(`HTTP webserver running.  Access it at:  http://localhost:8080/`);

for await (const request of server) {
  if (request.method != "GET") {
    request.respond({ status: 400, body: "Only GET requests are supported" });
    continue;
  }

  const path = {
    // make path local
    localPath: "." + request.url,
    webPath: (!request.url.endsWith("/")) ? request.url + "/" : request.url,
  };

  // from the frontend
  if (path.localPath.endsWith(".tar?download")) {
    const dir = path.localPath.replace(/.tar\?download$/, "");
    const dirTarPath = await createTar(dir);
    const resp = await serveFile(request, dirTarPath);
    request.respond(resp);
  } // from the browser
  else {
    try {
      const type = await Deno.stat(path.localPath);
      if (type.isDirectory) {
        const bodyContent = await writeToPage(path);
        const response = { status: 200, body: bodyContent };
        request.respond(response);
      } else {
        const resp = await serveFile(request, path.localPath);
        request.respond(resp);
      }
    } catch {
      request.respond({ status: 400 });
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

  const index = await Deno.readTextFile("./index.html");
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

async function serveFile(
  req: ServerRequest,
  filePath: string,
): Promise<{
  status: number;
  body: Deno.File;
  headers: Headers;
}> {
  const MEDIA_TYPES: Record<string, string> = {
    ".md": "text/markdown",
    ".html": "text/html",
    ".htm": "text/html",
    ".json": "application/json",
    ".map": "application/json",
    ".txt": "text/plain",
    ".ts": "text/typescript",
    ".tsx": "text/tsx",
    ".js": "application/javascript",
    ".jsx": "text/jsx",
    ".gz": "application/gzip",
    ".css": "text/css",
    ".wasm": "application/wasm",
    ".mjs": "application/javascript",
  };

  /** Returns the content-type based on the extension of a path. */
  function contentType(path: string): string | undefined {
    return MEDIA_TYPES[extname(path)];
  }

  const [file, fileInfo] = await Promise.all([
    Deno.open(filePath),
    Deno.stat(filePath),
  ]);
  const headers = new Headers();
  headers.set("content-length", fileInfo.size.toString());
  const contentTypeValue = contentType(filePath);
  if (contentTypeValue) {
    headers.set("content-type", contentTypeValue);
  }
  req.done.then(() => {
    file.close();
  });

  return {
    status: 200,
    body: file,
    headers,
  };
}
