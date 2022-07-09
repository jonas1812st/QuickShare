const fileInput = document.getElementById("uploadedFile_s");
const form = document.querySelector(".upload_file form");
const submitBtn = document.querySelector(".submit-btn");

//reset loading spinner

if (fileInput.files.length > 0) {
  dropHandler(fileInput, true);
}
/* 
form.addEventListener("submit", () => {
  submitBtn.innerHTML = `
  <div class="spinner-border" role="status">
    <span class="sr-only"></span>
  </div>`;
}); */

fileInput.addEventListener("dragenter", () => {
  styleInput();
});
fileInput.addEventListener("dragleave", () => {
  unstyleInput();
});

fileInput.addEventListener("change", (e) => {
  dropHandler(e, false);
});



function dropHandler(e, element) {
  var fileNames;
  if (element) {
    fileNames = Array.from(e.files).map(file => file.name).join("<br>");
  } else {
    fileNames = Array.from(e.target.files).map(file => file.name).join("<br>");
  }

  unstyleInput();

  const text = document.querySelector(".file_input .text");
  text.innerHTML = "<u class='header-selected'> Ausgewählt: </u> <div class='small-text'>" + fileNames + "</div>";
};

function styleInput() {
  const inputDiv = document.querySelector(".file_input");
  const text = document.querySelector(".file_input .text");
  text.style.opacity = "0";
  inputDiv.style.color = "rgb(146, 255, 138)";

  //inputDiv.classList.add("shake");
  inputDiv.style.backgroundColor = "rgb(146, 255, 138)";
  inputDiv.style.border = "4px dashed rgb(9, 125, 0)";
};

function unstyleInput() {
  const inputDiv = document.querySelector(".file_input");
  const text = document.querySelector(".file_input .text");
  text.style.opacity = "1";
  inputDiv.style.color = "";

  //inputDiv.classList.remove("shake");
  inputDiv.style.backgroundColor = "";
  inputDiv.style.border = "";
};

function delay(time) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, time);
  })
};