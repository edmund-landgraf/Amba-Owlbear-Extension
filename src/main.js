import './style.css'
import OBR from "@owlbear-rodeo/sdk";

document.querySelector('#app').innerHTML = `
  <div>
    <h1>AMBA Owlbear Extension</h1>
    <p id="status">Connected to Owlbear!</p>
    <button id="counter">Count is 0</button>
  </div>
`;

await OBR.onReady();

let count = 0;

document.getElementById("counter").addEventListener("click", () => {
  count++;
  document.getElementById("counter").textContent = `Count is ${count}`;
  OBR.notification.show(`Count is ${count}`);
});