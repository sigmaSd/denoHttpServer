function download(path) {
  const progressBar = document.getElementById("progressBar");
  const progressStatus = document.getElementById("progressStatus");

  function _download(path) {
    let width = 0;
    const tickId = setInterval(() => {
      width++;
      progressBar.style.width = width + "%";
    }, 500);

    fetch(`${path}.tar?download`).then((resp) => {
      const reader = resp.body.getReader();
      return new ReadableStream({
        start(controller) {
          return pump();
          async function pump() {
            const { done, value } = await reader.read();

            if (done) {
              controller.close();
              progressBar.style.visibility = "hidden";
              progressStatus.style.visibility = "hidden";
              progressBar.style.width = 0 + "%";
              clearTimeout(tickId);
              return;
            }
            controller.enqueue(value);
            return pump();
          }
        },
      });
    })
      .then((stream) => new Response(stream))
      .then((response) => response.blob())
      .then((blob) => URL.createObjectURL(blob))
      .then((blob) => {
        const blobLink = document.getElementById("blobLink");
        blobLink.setAttribute("href", blob);
        blobLink.setAttribute("download", `${path}.tar`);
        blobLink.click();
      })
      .catch((err) => console.error(err));
  }

  progressBar.style.visibility = "visible";
  progressStatus.style.visibility = "visible";

  _download(path);
}
