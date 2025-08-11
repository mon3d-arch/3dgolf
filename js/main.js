import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

// ========== 1. 기본 설정 ==========
const viewerContainer = document.getElementById('viewer-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeeeeee);

const camera = new THREE.PerspectiveCamera(50, viewerContainer.clientWidth / viewerContainer.clientHeight, 0.1, 1000);
camera.position.set(0, 15, 50);
camera.lookAt(new THREE.Vector3(0, 5, 0));

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(viewerContainer.clientWidth, viewerContainer.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewerContainer.appendChild(renderer.domElement);

// ========== 2. 조명 설정 ==========
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 10, 7.5);
scene.add(dirLight);

// ========== 3. 컨트롤 및 로더 설정 ==========
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 5, 0);
const loader = new GLTFLoader();
const fontLoader = new FontLoader();

// 단일 폰트 변수 선언
let mainLoadedFont;

// ========== 4. 모델 및 재질 관리 ==========
let currentFigure = null;
let trophyTextGroup = new THREE.Group();
scene.add(trophyTextGroup);
const modelParts = {
    shirt: null,
    pants: null,
    pedestal: null,
    grass_SubTool2: null,
};

// 폰트 로드 완료 후 피규어 로드 시작
// 폰트 파일 이름이 NanumSquare Bold_Regular.json로 변경되었습니다.
fontLoader.load('fonts/NanumSquare Bold_Regular.json', (font) => {
    mainLoadedFont = font;
    loadFigure('swing');
}, undefined, (error) => {
    console.error('An error happened while loading the font.', error);
});


function loadFigure(pose) {
    if (currentFigure) {
        scene.remove(currentFigure);
        if (modelParts.pedestal) {
            scene.remove(modelParts.pedestal);
            modelParts.pedestal.geometry.dispose();
            modelParts.pedestal.material.forEach(mat => mat.dispose());
            modelParts.pedestal = null;
        }
        trophyTextGroup.clear();
    }

    loader.load(`models/figure_${pose}.glb`, (gltf) => {
        currentFigure = gltf.scene;
        const scaleFactor = 0.05;
        currentFigure.scale.set(scaleFactor, scaleFactor, scaleFactor);
        scene.add(currentFigure);

        const box = new THREE.Box3().setFromObject(currentFigure);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        let grassSubTool1 = null;
        currentFigure.traverse(child => {
            if (child.isMesh) {
                if (child.name === "grass_SubTool1") {
                    grassSubTool1 = child;
                }
                if (child.name === "grass_SubTool2") {
                    modelParts.grass_SubTool2 = child;
                }
            }
        });
        
        let pedestalWidth = 15;
        let pedestalDepth = 15;
        let pedestalX = center.x;
        let pedestalZ = center.z;

        if (grassSubTool1) {
            const grassBox = new THREE.Box3().setFromObject(grassSubTool1);
            const grassSize = grassBox.getSize(new THREE.Vector3());
            const grassCenter = grassBox.getCenter(new THREE.Vector3());
            
            pedestalWidth = grassSize.x * 1.08;
            pedestalDepth = grassSize.z * 1.08;
            
            pedestalX = grassCenter.x;
            pedestalZ = grassCenter.z;
        }

        const pedestalGeometry = new THREE.BoxGeometry(pedestalWidth, 8, pedestalDepth);
        
        const initialColor = document.getElementById('pedestal-color') ? document.getElementById('pedestal-color').value : '#000000';
        const baseMaterial = new THREE.MeshStandardMaterial({ color: initialColor });
        
        const materials = [
            baseMaterial.clone(), 
            baseMaterial.clone(), 
            baseMaterial.clone(), 
            baseMaterial.clone(), 
            baseMaterial.clone(),
            baseMaterial.clone(), 
        ];
        
        const pedestal = new THREE.Mesh(pedestalGeometry, materials);
        pedestal.position.y = (center.y - size.y / 2) - (pedestalGeometry.parameters.height / 2);
        pedestal.position.x = pedestalX;
        pedestal.position.z = pedestalZ;
        
        scene.add(pedestal);
        modelParts.pedestal = pedestal;
        
        currentFigure.traverse(child => {
            if (child.isMesh) {
                if (child.name === "figure_shirt") modelParts.shirt = child;
                if (child.name === "figure_pants") modelParts.pants = child;
            }
        });
        
        updateColor('shirt', document.getElementById('shirt-color').value);
        updateColor('pants', document.getElementById('pants-color').value);
        
        if (document.getElementById('pedestal-text')) {
            updateTrophyText(document.getElementById('pedestal-text').value);
        }

    }, undefined, (error) => {
        console.error('An error happened while loading the model.', error);
    });
}

// ========== 5. 기능 함수 ==========
function updateColor(part, colorValue) {
    const mesh = modelParts[part];
    if (mesh) {
        if (part === 'pedestal' && Array.isArray(mesh.material)) {
            mesh.material.forEach(mat => {
                mat.color.set(colorValue);
                mat.needsUpdate = true;
            });
        } else if (mesh.material) {
            mesh.material.color.set(colorValue);
            mesh.material.needsUpdate = true;
        }
    }
}

function updateTrophyText(text) {
    if (!mainLoadedFont || !modelParts.pedestal) return;

    trophyTextGroup.clear();

    const lines = text.split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) {
        return;
    }
    
    const textSize = document.getElementById('pedestal-text-size') ? parseFloat(document.getElementById('pedestal-text-size').value) : 0.9;
    const textColor = document.getElementById('pedestal-text-color') ? document.getElementById('pedestal-text-color').value : '#FFFFFF';
    
    const lineHeight = textSize + 0.5;
    const totalHeight = (lines.length - 1) * lineHeight;
    let currentY = totalHeight / 2;

    const pedestalBox = new THREE.Box3().setFromObject(modelParts.pedestal);
    const pedestalCenter = pedestalBox.getCenter(new THREE.Vector3());
    const pedestalSize = pedestalBox.getSize(new THREE.Vector3());

    lines.forEach((lineText) => {
        const fontToUse = mainLoadedFont;
        const textGeometry = new TextGeometry(lineText, {
            font: fontToUse,
            size: textSize, 
            height: 0.2,
            curveSegments: 12,
        });
        
        textGeometry.computeBoundingBox();
        const textCenter = textGeometry.boundingBox.getCenter(new THREE.Vector3());

        const textMaterial = new THREE.MeshStandardMaterial({ color: textColor });
        const textMesh = new THREE.Mesh(textGeometry, textMaterial);
        
        textMesh.position.x = pedestalCenter.x - textCenter.x;
        textMesh.position.y = pedestalCenter.y - textCenter.y + currentY;
        textMesh.position.z = pedestalCenter.z + (pedestalSize.z / 2) - textGeometry.boundingBox.min.z;
        
        trophyTextGroup.add(textMesh);
        
        currentY -= lineHeight;
    });
}

// ========== 6. 이벤트 리스너 연결 ==========
document.getElementById('figure-pose').addEventListener('change', (e) => loadFigure(e.target.value));

document.getElementById('shirt-color').addEventListener('input', (e) => updateColor('shirt', e.target.value));
document.getElementById('pants-color').addEventListener('input', (e) => updateColor('pants', e.target.value));

if (document.getElementById('pedestal-color')) {
    document.getElementById('pedestal-color').addEventListener('input', (e) => {
        updateColor('pedestal', e.target.value);
        if (document.getElementById('pedestal-text')) {
            updateTrophyText(document.getElementById('pedestal-text').value);
        }
    });
}

if (document.getElementById('pedestal-text')) {
    document.getElementById('pedestal-text').addEventListener('input', (e) => updateTrophyText(e.target.value));
}

if (document.getElementById('pedestal-text-color')) {
    document.getElementById('pedestal-text-color').addEventListener('input', (e) => updateTrophyText(document.getElementById('pedestal-text').value));
}
if (document.getElementById('pedestal-text-size')) {
    document.getElementById('pedestal-text-size').addEventListener('input', (e) => updateTrophyText(document.getElementById('pedestal-text').value));
}

document.getElementById('order-button').addEventListener('click', () => {
    const options = {
        pose: document.getElementById('figure-pose').value,
        shirtColor: document.getElementById('shirt-color').value,
        pantsColor: document.getElementById('pants-color').value,
        pedestalColor: document.getElementById('pedestal-color') ? document.getElementById('pedestal-color').value : '#000000',
        text: document.getElementById('pedestal-text') ? document.getElementById('pedestal-text').value : '',
    };
    
    const optionsJson = JSON.stringify(options, null, 2);
    const previewImage = renderer.domElement.toDataURL('image/png');
    
    const outputDiv = document.getElementById('order-data-output');
    outputDiv.innerHTML = `
        <strong>주문 옵션 (JSON):</strong>
        <pre>${optionsJson}</pre>
        <strong>미리보기 이미지:</strong><br>
        <img src="${previewImage}" style="width:100%; border: 1px solid #ccc;"/>
    `;
    console.log("주문 데이터:", options);
    console.log("이미지 데이터 URL:", previewImage);
});

// 받침대 보이기/숨기기 기능 추가
document.getElementById('toggle-pedestal-button').addEventListener('click', () => {
    if (modelParts.pedestal) {
        modelParts.pedestal.visible = !modelParts.pedestal.visible;
    }
});

// 잔디(grass_SubTool2) 보이기/숨기기 기능 추가
document.getElementById('toggle-grass-button').addEventListener('click', () => {
    if (modelParts.grass_SubTool2) {
        modelParts.grass_SubTool2.visible = !modelParts.grass_SubTool2.visible;
    }
});


// ========== 7. 렌더링 루프 및 창 크기 조절 ==========
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = viewerContainer.clientWidth / viewerContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(viewerContainer.clientWidth, viewerContainer.clientHeight);
});

// ========== 최초 실행 ==========
animate();