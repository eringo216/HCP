import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import Stats from 'https://cdnjs.cloudflare.com/ajax/libs/stats.js/r17/Stats.min.js';

const scene = new THREE.Scene();
let videoWidth = 0;
let videoHeight = 0;
let windowposition = new THREE.Vector3(0, 0.5, 1)
let cameraDirection;
let headX = 0;
let headY = 0;
let headZ = 0;
let near = 0;
let isLeftDragging = false;
let isRightDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let yaw = Math.PI;   // 左右角度
let pitch = 0; // 上下角度
const targetLookAt = new THREE.Vector3();
const targetPos = new THREE.Vector3()

function updateLabel(el) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) {
        const template = label.dataset.template || `${el.id}: %NUM%`;
        label.textContent = template.replace("%NUM%", el.value);
    }
    if (el.type == "range") {
        formValues[el.id] = Number(el.value);
    }
}
window.updateLabel = updateLabel;
function LoadModel(path,scale) {
    const loader = new OBJLoader();        // ← 新しく作る！
    const mtlLoader = new MTLLoader();     // ← これも個別に！

    mtlLoader.load(path + '.mtl', (materials) => {
        materials.preload();
        loader.setMaterials(materials);          // ← そのまま使える
        loader.load(path + '.obj', (object) => {
            object.scale.set(scale,scale,scale);
            scene.add(object);
        });
    });
}

const camera = new THREE.PerspectiveCamera(
    40,
    window.innerWidth / window.innerHeight,
    0.1,
    1000,
);
window.camera = camera;
const renderer = new THREE.WebGLRenderer({ antialias: true });
const formValues = {

    "screenHeight": 1.0,
    "amplifier": 4.0,
    "eyexoffset": 0,
    "eyeyoffset": 0,
    "eyezoffset": 0,
    "fov": 40,
    "lerpfactor":0.2,
    "movespeed":0.01
};
window.formValues = formValues;
const stats = new Stats();
stats.showPanel(0); // 0: fps, 1: ms, 2: mb
document.body.appendChild(stats.dom);
stats.dom.style.position = "fixed";
stats.dom.style.right = "0px";
stats.dom.style.left = "auto"; 

const focalLength = 1738; // 焦点距離（ピクセル）
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshNormalMaterial();
const light = new THREE.PointLight(0xffffff, 1);
light.position.set(0, 0.66, 0.5).normalize();
const ambientLight = new THREE.AmbientLight(0x888888);
scene.add(ambientLight);
scene.add(light);
const gridHelper = new THREE.GridHelper(10, 10);
scene.add(gridHelper);
const cube = new THREE.Mesh(geometry, material);

// Off-axis projection setup
function updateOffAxisProjection(headX, headY, headZ) {
    const aspect = window.innerWidth / window.innerHeight;
    const far = camera.far;
    const fovRad = THREE.MathUtils.degToRad(formValues["fov"]);
    const screenHeight = formValues["screenHeight"];

    // カメラの向き（前方向）を取得
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);

    const distanceToNearPlane = screenHeight / (2 * Math.tan(fovRad / 2)) + headZ;

    const cameraPosition = new THREE.Vector3(
        windowposition.x,
        windowposition.y,
        windowposition.z
    ).sub(cameraDirection.clone().multiplyScalar(distanceToNearPlane));

    camera.position.copy(cameraPosition);

    // near平面の縦横サイズ
    const halfHeight = screenHeight / 2;
    const halfWidth = halfHeight * aspect;

    // 平面の横（right）・縦（up）ベクトル
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(cameraDirection, up).normalize();
    const trueUp = new THREE.Vector3().crossVectors(right, cameraDirection).normalize();
    const headOffset = right.clone().multiplyScalar(headX).add(trueUp.clone().multiplyScalar(headY));

    // near平面の四隅を計算（windowposition を中心とする）
    const topLeft = new THREE.Vector3(
        windowposition.x,
        windowposition.y,
        windowposition.z
    ).add(trueUp.clone().multiplyScalar(halfHeight))
     .sub(right.clone().multiplyScalar(halfWidth))
     .sub(headOffset);

    const topRight = new THREE.Vector3(
        windowposition.x,
        windowposition.y,
        windowposition.z
    ).add(trueUp.clone().multiplyScalar(halfHeight))
     .add(right.clone().multiplyScalar(halfWidth))
     .sub(headOffset);

    const bottomLeft = new THREE.Vector3(
        windowposition.x,
        windowposition.y,
        windowposition.z
    ).sub(trueUp.clone().multiplyScalar(halfHeight))
     .sub(right.clone().multiplyScalar(halfWidth))
     .sub(headOffset);

    // カメラから各隅へのベクトル
    const tl = topLeft.clone().sub(cameraPosition);
    const tr = topRight.clone().sub(cameraPosition);
    const bl = bottomLeft.clone().sub(cameraPosition);

    // near距離
    const near = tl.dot(cameraDirection);
    //console.log("適切な near = " + near);
    if (near <= 0) {
        console.warn("カメラが箱の後ろにあります。Near planeを調整してください。");
        return; // カメラが箱より後ろにある場合は更新しない
    }

    // フラスタムの計算
    const leftFrustum = tl.dot(right);
    const rightFrustum = tr.dot(right);
    const bottomFrustum = bl.dot(trueUp);
    const topFrustum = tl.dot(trueUp);

    //console.log(`Frustum: left=${leftFrustum(2)}, right=${rightFrustum.toFixed(2)}, top=${topFrustum.toFixed(2)}, bottom=${bottomFrustum.toFixed(2)}`);

    // 投影行列を作成
    const projectionMatrix = new THREE.Matrix4();
    projectionMatrix.makePerspective(
        leftFrustum,
        rightFrustum,
        topFrustum,
        bottomFrustum,
        near,
        far
    );
    camera.projectionMatrix = projectionMatrix;
    camera.projectionMatrixInverse = projectionMatrix.clone().invert();
    camera.position.set(headX + windowposition.x, headY + windowposition.y, windowposition.z + near)
}

// MediaPipe FaceMesh setup
const videoElement = document.getElementById("video");
const faceMesh = new FaceMesh({
    locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
});

faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: false,
    minDetectionConfidence: 0.3,
    minTrackingConfidence: 0.3,
});

faceMesh.onResults((results) => {
    //console.log(results.multiFaceLandmarks.length)
    if (results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        const leftEye = landmarks[33];
        const rightEye = landmarks[263];
        const faceleft = landmarks[234]
        const faceright = landmarks[454] 
    
        // 顔の幅を計算（ピクセル）
        const faceWidthPixels = Math.abs(faceleft.x - faceright.x) * videoWidth;
    
        // Z軸の距離を計算（メートル）
        const realFaceWidth = 0.15; // 実際の顔の幅（メートル）
        const distance = (realFaceWidth * focalLength) / faceWidthPixels;
    
        // 顔の中心の正規化座標（X, Y）
        const centerX = (leftEye.x + rightEye.x) / 2 + formValues["eyexoffset"];
        const centerY = (leftEye.y + rightEye.y) / 2 + formValues["eyeyoffset"];
    
        // 正規化座標をピクセルに変換
        const pixelX = centerX * videoWidth;
        const pixelY = centerY * videoHeight;
    
        // ピクセルをメートルに変換
        const realX =
            (pixelX - videoWidth / 2) *
            (distance / focalLength) *
            (realFaceWidth / (faceWidthPixels / videoWidth));
        const realY =
            (pixelY - videoHeight / 2) *
            (distance / focalLength) *
            (realFaceWidth / (faceWidthPixels / videoHeight));
    
        // headX, headY, headZを実世界の距離（メートル）で設定
        headX = - realX * formValues["amplifier"];
        headY = - realY * formValues["amplifier"];
        headZ = distance * formValues["amplifier"];

        //console.log(`Head: x=${headX.toFixed(2)}, y=${headY.toFixed(2)}, z=${headZ.toFixed(2)}`);
    }
});

navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings();
    console.log('Camera settings:', settings);

    // 取得できた解像度を使ってMediaPipeのCameraを初期化
    videoWidth = settings.width || 640;
    videoHeight = settings.height || 480;

    const cameraMP = new Camera(videoElement, {
        onFrame: async () => {
        await faceMesh.send({ image: videoElement });
        },
        width: videoWidth,
        height: videoHeight,
        facingMode: "user"
    });
    cameraMP.start();
}).catch((error) => {
    console.error("getUserMedia error:", error);
});

// 押されているキーを記録するためのオブジェクト
const keysPressed = {};

window.addEventListener("contextmenu", (e) => e.preventDefault());


// キーが押されたときに true にする
window.addEventListener("keydown", (e) => {
    keysPressed[e.key.toLowerCase()] = true;
});

// キーが離されたときに false にする
window.addEventListener("keyup", (e) => {
    keysPressed[e.key.toLowerCase()] = false;
});

// マウス押下時
window.addEventListener("mousedown", (event) => {
    if (event.button === 0) {
        isLeftDragging = true;
    } else if (event.button === 2) {
        isRightDragging = true;
    }
    previousMousePosition = {
        x: event.clientX,
        y: event.clientY
    };
});

// マウス離上時
window.addEventListener("mouseup", () => {
    isLeftDragging = false;
    isRightDragging = false;
});

window.addEventListener("wheel", (event) => {
    headZ += event.deltaY * 0.001; // ホイールを前に回すと奥に
});

// マウス移動時（ドラッグ中）
document.querySelector('canvas[data-engine = "three.js r176"]').addEventListener("mousemove", (event) => {
    const deltaX = event.clientX - previousMousePosition.x;
    const deltaY = event.clientY - previousMousePosition.y;

    if (isLeftDragging) {
        const sensitivity = 0.001;
        yaw -= deltaX * sensitivity;
        pitch -= deltaY * sensitivity;

        const maxPitch = Math.PI / 2 - 0.01;
        const minPitch = -Math.PI / 2 + 0.01;
        pitch = Math.max(minPitch, Math.min(maxPitch, pitch));
    } else if (isRightDragging) {
        const sensitivity = 0.001;
        headX += deltaX * sensitivity;
        headY -= deltaY * sensitivity;
    }
    previousMousePosition = {
        x: event.clientX,
        y: event.clientY
    };

    const lookTarget = camera.position.clone().add(cameraDirection);

    camera.lookAt(lookTarget);
});

// キー押下管理はすでにある前提

function updateWindowPosition() {
    //console.log(yaw,pitch)

    const moveSpeed = formValues["movespeed"]
    cameraDirection = new THREE.Vector3(
        Math.cos(pitch) * Math.sin(yaw),
        Math.sin(pitch),
        Math.cos(pitch) * Math.cos(yaw)
    ).normalize();

    const worldUp = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(cameraDirection, worldUp).normalize();

    if (keysPressed['w']) {
        windowposition.add(cameraDirection.clone().multiplyScalar(moveSpeed));
    }
    if (keysPressed['s']) {
        windowposition.sub(cameraDirection.clone().multiplyScalar(moveSpeed));
    }
    if (keysPressed['a']) {
        windowposition.sub(right.clone().multiplyScalar(moveSpeed));
    }
    if (keysPressed['d']) {
        windowposition.add(right.clone().multiplyScalar(moveSpeed));
    }

    // 上方向: Space
    if (keysPressed[' ']) {  // ' 'はスペースキーのe.key
        windowposition.y += moveSpeed;
    }
    // 下方向: Shift（左右どちらでも）
    if (keysPressed['shift']) {
        windowposition.y -= moveSpeed;
    }
}

function updateCoordsDisplay(position) {
    const coordsDiv = document.getElementById("coords");
    if (!coordsDiv) return;

    coordsDiv.innerHTML = `x: ${windowposition.x.toFixed(2)} y: ${windowposition.y.toFixed(2)} z: ${windowposition.z.toFixed(2)} yaw:${yaw.toFixed(2)} pitch:${pitch.toFixed(2)} <br><br> headX: ${headX.toFixed(2)} headY: ${headY.toFixed(2)} headZ: ${headZ.toFixed(2)}`;
}
  
// Animation loop
function animate() {

    requestAnimationFrame(animate);
    stats.begin();
    updateWindowPosition();
    updateCoordsDisplay(camera.position);
    updateOffAxisProjection(headX, headY, headZ);
    renderer.render(scene, camera);
    stats.end();
}
animate();
//LoadModel("./obj/znd/znd", 0.2);
//LoadModel("./obj/sakuya/sakuya", 0.5);
LoadModel("./obj/apple/ringo", 1);

// Resize handling
window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});