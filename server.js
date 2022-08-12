const fs = require('fs');
const {
  promisify
} = require('util');
const unlinkAsync = promisify(fs.unlink);

const http = require('http');
const nodemailer = require("nodemailer");
const express = require("express");
const app = express();
const env = require("dotenv").config();
const multer = require("multer");
const path = require("path");
const cookieParser = require("cookie-parser");

const JSZip = require('jszip');

//socket.io
const server = http.createServer(app);
const {
  Server
} = require("socket.io");
const io = new Server(server);

//database
const sqlite3 = require("sqlite3");
const {
  setInterval
} = require('timers/promises');
var db = new sqlite3.Database("./database/uploadData.db");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

//set up multer
const upload = multer({
  storage: storage
});
//SECTION initialization
//initialize bootstrap
app.use(
  "/bootstrap/css",
  express.static(path.join(__dirname, "node_modules/bootstrap/dist/css"))
);
app.use(
  "/bootstrap/js",
  express.static(path.join(__dirname, "node_modules/bootstrap/dist/js"))
);
//icons
app.use(
  "/bootstrap/icons",
  express.static(path.join(__dirname, "node_modules/bootstrap-icons/font"))
);

//initialize js and css files
app.use(
  "/css",
  express.static(path.join(__dirname, "src/css"))
);
app.use(
  "/js",
  express.static(path.join(__dirname, "src/js"))
);

//initialize ejs
app.set("view engine", "ejs");

//Server

//initialize sequences
var dbSeq = {
  seqDel_State: 0,
  seqOpen_Rooms: 0
}

async function initializeSeq() {
  dbSeq.seqDel_State = await getSequence("uploaded_files");
  dbSeq.seqDel_State = Number(dbSeq.seqDel_State.seq) + 1;

  dbSeq.seqOpen_Rooms = await getSequence("open_rooms");
  dbSeq.seqOpen_Rooms = Number(dbSeq.seqOpen_Rooms.seq) + 1;
}

initializeSeq();

// Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.urlencoded({
  extended: false
}));

//Set cookie parser
app.use(cookieParser());

//SECTION Routes
app.get("/", (req, res) => {
  //Home page
  res.render("pages/home");
});

app.get("/select", (req, res) => {
  res.render("pages/selecting.ejs");
});

//delete room
app.post("/delete-room", (req, res) => {
  const userID = req.body["user-id"];

  if (!userID) {
    res.redirect("/");
    return;
  } else {
    completeRoomDeletionByUserID(userID);
    res.redirect("/close-tab");
  }
});

app.get("/close-tab", (req, res) => {
  res.render("pages/close-tab");
});

app.post("/room-redirecter", (req, res) => {
  var code = req.body["room-pin"];

  if (!code) {
    res.redirect("/");
  } else {
    if (code.length === 6) {
      code = code.slice(0, 3) + " " + code.slice(3, 6);
    } else if (code.length === 7) {
      res.redirect("/room?rc=" + code);
    } else {
      res.redirect("/");
    }
  }
})

app.get("/upload", (req, res) => {
  res.redirect("/");
})

app.post("/upload", upload.array("uploadedFile_s"), async (req, res) => {
  const timeLimit = Number(req.body["time-limit"]) * 60000; // in milliseconds TODO: Das hier wieder zurück auf 60000 setzen
  const currTimeStamp = Date.now();
  const deletionTimeStamp = currTimeStamp + timeLimit;

  const uuid = generateUIDv4();

  //add fileData to database
  for (const file of req.files) {
    const fileObj = {
      filename: file.originalname,
      fullname: file.filename,
      size: file.size,
      timestamp: currTimeStamp,
      deletionDate: deletionTimeStamp,
      dbID: dbSeq.seqDel_State,
      roomID: dbSeq.seqOpen_Rooms,
      zip: false
    }
    await insertFileEntry(fileObj);

    const timeOut = setTimeout(async () => {
      await unlinkAsync(file.path);
      deleteFileEntry(fileObj.dbID);
    }, timeLimit);

    dbSeq.seqDel_State++;
  };

  //create zip folder
  const zipData = await zipFiles(req.files);

  zipData.dbID = dbSeq.seqDel_State;
  zipData.roomID = dbSeq.seqOpen_Rooms;
  dbSeq.seqDel_State++;

  await insertFileEntry(zipData);

  //create new Room in database
  const accessT = await getAccessToken();

  const roomObj = {
    owner: uuid,
    roomCode: accessT,
    timestamp: currTimeStamp,
    deletionDate: deletionTimeStamp,
    dbID: dbSeq.seqOpen_Rooms,
    zipName: zipData.fullname,
    amountFiles: req.files.length
  }

  await insertRoomEntry(roomObj);

  const timeOut = setTimeout(async () => {
    await unlinkAsync("zipFiles/" + zipData.fullname);
    deleteRoomEntry(roomObj.dbID);
  }, timeLimit);

  dbSeq.seqOpen_Rooms++;

  //set cookie
  const options = {
    maxAge: timeLimit,
    httpOnly: true
  }
  res.cookie("user-id", uuid, options);

  //res.send("Success");
  res.redirect("/room?rc=" + accessT);
});

app.get("/room", async (req, res) => {
  const query = req.query;
  const roomCode = query.rc;

  if (roomCode && await roomCodeExists(roomCode)) { //rc for room_code
    var roomData = await getRoomEntry(roomCode);

    if (req.cookies["user-id"] && req.cookies["user-id"] === roomData.owner) {
      roomData["own-id"] = req.cookies["user-id"];
    }
    if (roomData.files.length === 0) {
      res.redirect("/");
      return false;
    }

    roomData.owner = "not-given";

    res.render("pages/room", {
      roomData: roomData
    });
  } else {
    res.redirect("/");
  }
})

//Download route
app.get("/download", (req, res) => {
  const query = req.query;
  const filePath = query.path;

  if (filePath) {
    res.download(__dirname + filePath);
  } else {
    res.redirect("/no-such-file");
  }
})

server.listen(process.env.SERVER_PORT, () => {
  console.log("Server running on port " + process.env.SERVER_PORT);
});

//SECTION io functions
io.on("connection", (socket) => {
  var ownRoom;

  socket.on("watching-room", (roomID) => {
    ownRoom = "room-" + roomID;
    socket.join(ownRoom);
    io.to(ownRoom).emit("I connect", peopleInRoom(ownRoom));
  });

  socket.on("disconnecting", () => {
    if (ownRoom) {
      io.to(ownRoom).emit("I disconnect", peopleInRoom(ownRoom) - 1);
    }
  });

  socket.on("file-downloaded", (fileIndex, fileData) => {
    increaseDownloads(fileData.id);

    io.to(ownRoom).emit("user-downloaded-file", fileIndex);
  });

  socket.on("all-files-downloaded", (files) => {
    for (const [index, file] of files.entries()) {
      increaseDownloads(file.id);

      io.to(ownRoom).emit("user-downloaded-file", index);
    }
  });

  socket.on("delete-room", () => {
    io.to(ownRoom).emit("roomDeleted");
  })

  function peopleInRoom(roomName) {
    return io.sockets.adapter.rooms.get(roomName).size;
  }
})

//SECTION Send Emails
function sendEmail(email, content, subject) {
  return new Promise((resolve, reject) => {
    var transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'gtbalstertaltest@gmail.com',
        pass: '"!DGTBdGAies'
      }
    });

    var mailOptions = {
      from: 'gtbalstertaltest@gmail.com',
      to: email,
      subject: subject,
      text: content
    };

    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        console.log(error);
      } else {
        resolve(console.log('Email sent: ' + info.response));
      }
    });
  })
};

//SECTION any functions
function delay(time) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, time);
  })
};

function generateUIDv4() {
  return "00-0-4-1-000".replace(/[^-]/g, (s) =>
    (((Math.random() + ~~s) * 0x10000) >> s).toString(16).padStart(4, "0")
  );
}

async function getAccessToken() {
  return new Promise(function (resolve, reject) {
    async function getAccessTokenInner() {
      const accessToken = generateAccessToken();
      if (await roomCodeExists(accessToken)) {
        await getAccessTokenInner();
      } else {
        resolve(accessToken);
      }
    }
    getAccessTokenInner();
  })

}

function generateAccessToken(test) {
  return "000 000".replace(/0/g, (s) => {
    return Math.random().toString()[2];
  })
}

//SECTION zip files
function zipFiles(files) {
  return new Promise((resolve, reject) => {
    const zip = new JSZip();

    try {
      for (const file of files) {
        const fileData = fs.readFileSync("uploads/" + file.filename);
        zip.file(file.filename, fileData);
      }

      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const zipName = uniqueSuffix + "-downloadAll.zip";
      zip.generateNodeStream({
          type: "nodebuffer",
          streamFiles: true
        })
        .pipe(fs.createWriteStream("zipFiles/" + zipName));

      resolve({
        filename: "downloadAll.zip",
        fullname: zipName,
        size: 0,
        timestamp: 0,
        deletionDate: 0,
        err: false,
        zip: true
      });
    } catch (err) {
      resolve({
        filename: "downloadAll.zip",
        fullname: "error",
        size: 0,
        timestamp: 0,
        deletionDate: 0,
        err: true
      })
      throw err;
    }
  });
}

//SECTION database functions
function insertFileEntry(fileObj) {
  return new Promise((resolve, reject) => {
    db.run(`INSERT INTO uploaded_files (filename, size, timestamp, deletionDate, room_id, fullname, downloads, zip) VALUES ("${fileObj.filename}", ${fileObj.size}, ${fileObj.timestamp}, ${fileObj.deletionDate}, ${fileObj.roomID}, "${fileObj.fullname}", 0, "${fileObj.zip}");`, (err) => {
      if (err) throw err;
      resolve();
    })
  });
};

function deleteFileEntry(dbID) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM uploaded_files WHERE id = ${dbID};`, (err) => {
      if (err) throw err;
      resolve();
    });
  });
}

function insertRoomEntry(roomObj) {
  return new Promise((resolve, reject) => {
    db.run(`INSERT INTO open_rooms (room_code, owner, deletion_date, createdAt, zipName, amountFiles) VALUES ("${roomObj.roomCode}", "${roomObj.owner}", ${roomObj.deletionDate}, ${roomObj.timestamp}, "${roomObj.zipName}", ${roomObj.amountFiles});`, (err) => {
      if (err) throw err;
      resolve();
    });
  });
}

function deleteRoomEntry(dbID) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM open_rooms WHERE id = ${dbID};`, (err) => {
      if (err) throw err;
      resolve();
    });
  });
}

function completeRoomDeletionByUserID(userID) {
  return new Promise(async (resolve, reject) => {
    const roomData = await getRoomEntryByUserID(userID);

    if (roomData) {
      db.run(`DELETE FROM open_rooms WHERE owner = "${userID}";`, (err) => {
        if (err) throw err;
        resolve();
      });

      completeFileDeletionByRoomID(roomData[0].id);
    }
  });
}

function completeFileDeletionByRoomID(roomID) {
  return new Promise(async (resolve, reject) => {
    const files = await getFilesForRoom(roomID);

    for (const file of files) {
      if (file.zip === "true") {
        await unlinkAsync("zipFiles/" + file.fullname);
      } else {
        await unlinkAsync("uploads/" + file.fullname);
      }
    }

    db.run(`DELETE FROM uploaded_files WHERE room_id = ${roomID};`, (err) => {
      if (err) throw err;
      resolve();
    });
  });
}

function getFilesForRoom(roomID) {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM uploaded_files WHERE room_id = ${roomID}`, (err, rows) => {
      if (err) throw err;

      if (rows.length > 0) {
        resolve(rows);
      } else {
        resolve(false)
      }
    })
  })
}

function getRoomEntry(roomCode) {
  return new Promise((resolve, reject) => {
    db.each(`SELECT * FROM open_rooms WHERE room_code = "${roomCode}";`, async (err, row) => {
      if (err) throw err;
      const roomID = row.id;

      const roomObj = {
        roomID: roomID,
        roomCode: row.room_code,
        owner: row.owner,
        deletion_date: row.deletion_date,
        createdAt: row.createdAt,
        files: await getUploadedFiles(roomID),
        zipName: row.zipName,
      };

      resolve(roomObj);
    })
  })
}

function getRoomEntryByUserID(userID) {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM open_rooms WHERE owner = "${userID}";`, (err, rows) => {
      if (err) throw err;

      if (rows.length > 0) {
        resolve(rows);
      } else {
        resolve(false);
      }
    });
  });
}

function getUploadedFiles(roomID) {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM uploaded_files WHERE room_id = ${roomID} AND zip = "false";`, (err, rows) => {
      if (err) throw err;

      if (rows.length > 0) {
        resolve(rows);
      } else {
        resolve(false);
      }
    })
  })
}

function getSequence(name) {
  return new Promise((resolve, reject) => {
    db.each(`SELECT seq FROM sqlite_sequence WHERE name = "${name}";`, (err, row) => {
      if (err) throw err;
      resolve(row);
    });
  });
};

function roomCodeExists(roomCode) {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM open_rooms WHERE room_code = "${roomCode}"`, (err, rows) => {
      if (err) throw err;
      if (rows.length > 0) {
        resolve(true);
      } else {
        resolve(false);
      }
    })
  })
}

function increaseDownloads(fileID) {
  return new Promise((resolve, reject) => {
    db.run(`UPDATE uploaded_files SET downloads = downloads + 1 WHERE id = ${fileID};`, (err) => {
      if (err) throw err;
      resolve();
    })
  })
}