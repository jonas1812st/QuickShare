var socket = io();

var countRoomMembers = 0;

//SECTION socket.io functions
socket.emit("watching-room", roomData.roomID);

socket.on("I disconnect", (amount) => {
  updateWatching(amount)
});

socket.on("I connect", (amount) => {
  updateWatching(amount)
});

socket.on("user-downloaded-file", fileIndex => {
  if (!roomData["own-id"]) {
    return false;
  }

  if (roomData.files[fileIndex].downloads) {
    roomData.files[fileIndex].downloads++;
  } else {
    roomData.files[fileIndex].downloads = 1;
  }
  updateDownloads();
});

window.onload = function(){updateDownloads();};

//SECTION user-tracking
function updateWatching(amount) {
  const watchingDisplay = document.getElementById("watchingAmount");
  watchingDisplay.innerText = amount;
}

function updateDownloads() {
  if(!roomData["own-id"]){
    return;
  }

  const downloadsDisplay = document.querySelectorAll(".amount-downloads");

  roomData.files.forEach((file, index) => {
    if (file.downloads) {
      console.log(index);
      downloadsDisplay[index].innerText = file.downloads;
    }
  })
}

//SECTION event-listener
const downloadBtns = document.querySelectorAll(".download-link");
const downloadAllBtn = document.getElementById("downloadAllBtn");

downloadBtns.forEach((btn, index) => {
  btn.addEventListener("click", () => {
    socket.emit("file-downloaded", index, roomData.files[index]);
  });
});

if(downloadAllBtn){
  downloadAllBtn.addEventListener("click", () => {
    socket.emit("all-files-downloaded", roomData.files);
  })
}


//SECTION timer functions
const timer = document.querySelector(".timer");
setInterval(() => {
  timer.innerText = msToTime(roomData.deletion_date - Date.now())
}, 100)

function msToTime(s) {
  function pad(n, z) {
    z = z || 2;
    return ("00" + n).slice(-z);
  }
  var ms = s % 1000;
  s = (s - ms) / 1000;
  var secs = s % 60;
  s = (s - secs) / 60;
  var mins = s % 60;
  var hrs = (s - mins) / 60;

  return pad(hrs) + ":" + pad(mins) + ":" + pad(secs);
}

//SECTION cookie functions
function getCookie(cname) {
  var name = cname + "=";
  var decodedCookie = decodeURIComponent(document.cookie);
  var ca = decodedCookie.split(";");
  for (let index = 0; index < ca.length; index++) {
    var c = ca[index];
    while (c.charAt(0) == " ") {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      return c.substring(name.length, c.length);
    }
  }
  return "";
}

setTimeout(() => {
  window.close();
}, (roomData.deletion_date - Date.now()) + 500);