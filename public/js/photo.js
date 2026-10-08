// Shrinks a picture taken with the phone camera before it is sent: at most ~1200 px on the long side, JPEG,
// usually 100-200 KB instead of several MB. The check stays readable, the storage stays small.
var STEPS = [[1280, 0.6], [1100, 0.5], [900, 0.45], [760, 0.4]];
var TARGET_CHARS = 220000;

export function shrinkImage(file) {
  return new Promise(function (resolve, reject) {
    if (!file || !/^image\//.test(file.type || "image/")) {
      reject(new Error("Chwazi yon foto."));
      return;
    }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      var out = "";
      for (var i = 0; i < STEPS.length; i++) {
        var scale = Math.min(1, STEPS[i][0] / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.naturalWidth * scale));
        c.height = Math.max(1, Math.round(img.naturalHeight * scale));
        var ctx = c.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        out = c.toDataURL("image/jpeg", STEPS[i][1]);
        if (out.length <= TARGET_CHARS) break;
      }
      if (out.indexOf("data:image/jpeg") !== 0) reject(new Error("Foto a pa ka li. Eseye yon lòt."));
      else resolve(out);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error("Foto a pa ka li. Eseye yon lòt."));
    };
    img.src = url;
  });
}
