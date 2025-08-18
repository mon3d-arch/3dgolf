import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { priceData, poseData, engravingData } from './data.js';

// ========== 1. 기본 설정 ==========
const viewerContainer = document.getElementById('viewer-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeeeeee);
const loadingSpinner = document.getElementById('loading-spinner');
const statusMessage = document.getElementById('status-message');
const engravingTextarea = document.getElementById('engraving-text'); // textarea 엘리먼트 가져오기

let camera, renderer, controls;
let model;
const modelParts = {};
let currentTextMesh;
let fontFirstLine; // 첫 번째 줄 폰트
let fontOtherLines; // 두 번째 줄부터 폰트
let newGrassBaseMesh;
let currentSpecialModel; // 특수 모델 관리를 위한 단일 변수
let modelCache = {};
let fixedFirstLine = ''; // 수정 불가능한 첫 번째 줄을 저장할 변수

// ========== 2. Load and Initialization Functions ==========
function init() {
    // Camera setup
    camera = new THREE.PerspectiveCamera(50, viewerContainer.clientWidth / viewerContainer.clientHeight, 0.1, 1000);
    camera.position.set(0, 15, 50);
    camera.lookAt(new THREE.Vector3(0, 5, 0));

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true, canvas: document.getElementById('trophy-viewer') });
    renderer.setSize(viewerContainer.clientWidth, viewerContainer.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Lighting setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 7.5);
    scene.add(dirLight);

    // Controls setup
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    
    // Window resize event listener
    window.addEventListener('resize', onWindowResize);
    
    // Load both fonts (only once when the app runs)
    const fontLoader = new FontLoader();
    const font1Promise = new Promise(resolve => fontLoader.load('fonts/Monotype Corsiva_Regular.json', resolve));
    const font2Promise = new Promise(resolve => fontLoader.load('fonts/AuctionGothic_Bold.json', resolve));

    Promise.all([font1Promise, font2Promise])
        .then(([font1, font2]) => {
            fontFirstLine = font1;
            fontOtherLines = font2;
            
            // Initial setup for options
            updateSizeOptions();
            updatePoseOptions();
            
            document.getElementById('club-selection').value = 'iron';
            
            const initialShape = document.getElementById('trophy-shape').value;
            const initialPose = document.getElementById('figure-pose').value;
            loadModel(initialShape, initialPose);
            
            document.getElementById('price-table').style.display = 'table';
        })
        .catch(error => {
            const errorMessage = `폰트 로딩 실패. 파일이 올바른 경로에 있는지 확인하세요.`;
            console.error(errorMessage, error);
            setStatusMessage(errorMessage, true);
        });

    // Start the rendering loop
    animate();
}

// ========== 3. Model Load and Update ==========
const loader = new GLTFLoader();
loader.setPath('./models/');

function loadModel(shape, poseKey) {
    showLoadingSpinner();
    setStatusMessage('모델을 불러오는 중...');
    
    const poseInfo = poseData[poseKey];
    if (!poseInfo) {
        const errorMessage = `오류: 포즈 데이터가 없습니다: ${poseKey}`;
        console.error(errorMessage);
        setStatusMessage(errorMessage, true);
        hideLoadingSpinner();
        return;
    }
    
    const { partPrefix, modelFile } = poseInfo;
    const modelName = modelFile;
    const cacheKey = modelName;

    // 기존 모델, 텍스트, 받침대 제거
    if (model) {
        scene.remove(model);
        model.traverse(child => {
            if (child.isMesh) {
                child.geometry.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach(material => material.dispose());
                } else if (child.material.isMaterial) {
                    child.material.dispose();
                }
            }
        });
        model = null;
    }

    if (currentTextMesh) {
        scene.remove(currentTextMesh);
        currentTextMesh.traverse(child => {
            if (child.isMesh) {
                child.geometry.dispose();
                child.material.dispose();
            }
        });
        currentTextMesh = null;
    }

    if (newGrassBaseMesh) {
        scene.remove(newGrassBaseMesh);
        newGrassBaseMesh.geometry.dispose();
        newGrassBaseMesh.material.dispose();
        newGrassBaseMesh = null;
    }

    if (modelCache[cacheKey]) {
        console.log(`Using cached model: ${cacheKey}`);
        model = modelCache[cacheKey].clone();
        scene.add(model);
        
        updateModelPartsAndBase(model, partPrefix);
        
        hideLoadingSpinner();
        setStatusMessage('');
        fitCameraToModel();
    } else {
        loader.load(
            modelName,
            (gltf) => {
                model = gltf.scene;
                scene.add(model);
                
                modelCache[cacheKey] = gltf.scene;
                
                updateModelPartsAndBase(model, partPrefix);
                
                hideLoadingSpinner();
                setStatusMessage('');
                fitCameraToModel();
            },
            (xhr) => {
                const percent = (xhr.loaded / xhr.total * 100).toFixed(0);
                setStatusMessage(`모델 로딩 중: ${percent}%`);
            },
            (error) => {
                const errorMessage = `모델 로딩 실패. 파일이 올바른 경로에 있는지 확인하세요. (${modelName})`;
                console.error(errorMessage, error);
                setStatusMessage(errorMessage, true);
                hideLoadingSpinner();
            }
        );
    }
}

function updateModelPartsAndBase(loadedModel, partPrefix) {
    for (const part of ['face', 'shirt', 'pants', 'cap', 'arm', 'glove', 'pedestal', 'grass', 'iron', 'driver']) {
        modelParts[part] = loadedModel.getObjectByName(`${partPrefix}_${part}`);
    }
    
    // 기존 받침대 제거
    if (newGrassBaseMesh) {
        scene.remove(newGrassBaseMesh);
        newGrassBaseMesh.geometry.dispose();
        newGrassBaseMesh.material.dispose();
        newGrassBaseMesh = null;
    }

    // 모델 전체를 탐색하여 grass2 오브젝트를 찾습니다.
    let grass2 = null;
    loadedModel.traverse(child => {
        if (child.name === 'grass2') {
            grass2 = child;
        }
    });

    // 받침대 생성을 위한 변수 초기화
    let baseSize = new THREE.Vector3(15, 2, 47); // 기본 크기 설정
    let newWidth = baseSize.x;
    let newHeight = baseSize.y;
    let newPosition = new THREE.Vector3(0, 0, 0);
    
    // grass2 오브젝트가 존재하면 해당 오브젝트의 크기와 위치를 가져옵니다.
    if (grass2) {
        const grassBox = new THREE.Box3().setFromObject(grass2);
        const size = new THREE.Vector3();
        grassBox.getSize(size);
        const center = new THREE.Vector3();
        grassBox.getCenter(center);
        
        newHeight = size.x * 0.6; 

        const trophyShape = document.getElementById('trophy-shape').value;
        if (trophyShape === 'logo') {
            newWidth = size.x * 2; 
            newPosition = new THREE.Vector3(center.x - (newWidth - size.x) / 2, center.y - (size.y / 2) - (newHeight / 2), center.z);
        } else { // 일반형 받침대
            newWidth = size.x; 
            newPosition = new THREE.Vector3(center.x, center.y - (size.y / 2) - (newHeight / 2), center.z);
        }
    }
    
    // 항상 새로운 받침대 생성
    const newGeometry = new THREE.BoxGeometry(newWidth, newHeight, baseSize.z);
    const newMaterial = new THREE.MeshPhongMaterial({ color: 0x000000 });
    newGrassBaseMesh = new THREE.Mesh(newGeometry, newMaterial);
    newGrassBaseMesh.name = 'newGrassBase';
    newGrassBaseMesh.position.copy(newPosition);
    scene.add(newGrassBaseMesh);
    
    updateTrophyColors();
    handlePurposeChange();
    updateClubDisplay(document.getElementById('club-selection').value);
}

// ========== 4. Customization Functions ==========
function updateTrophyColors() {
    const shirtColor = document.getElementById('shirt-color').value;
    const pantsColor = document.getElementById('pants-color').value;
    
    if (modelParts.shirt) {
        modelParts.shirt.material.color.set(shirtColor);
    }
    if (modelParts.pants) {
        modelParts.pants.material.color.set(pantsColor);
    }
}

function updateTrophyText() {
    const engravingText = engravingTextarea.value;
    const pedestaTextColorInput = document.getElementById('pedestal-text-color');
    const textColor = pedestaTextColorInput.value;
    
    if (currentTextMesh) {
        scene.remove(currentTextMesh);
        currentTextMesh.traverse(child => {
            if (child.isMesh) {
                child.geometry.dispose();
                child.material.dispose();
            }
        });
        currentTextMesh = null;
    }

    // 폰트가 모두 로드되지 않았거나 각인 텍스트가 없으면 업데이트를 건너뜁니다.
    if (!fontFirstLine || !fontOtherLines || engravingText.trim() === '') {
        return;
    }

    const lines = engravingText.split('\n');
    const textGroup = new THREE.Group();
    
    const targetBase = newGrassBaseMesh;
    if (!targetBase) {
        console.warn("Could not find newGrassBase mesh. Text update skipped.");
        return;
    }

    const baseBox = new THREE.Box3().setFromObject(targetBase);
    const baseSize = new THREE.Vector3();
    baseBox.getSize(baseSize);

    const basePosition = targetBase.position.clone();
    
    const topMargin = 0.5;
    let currentY = (baseSize.y / 2) - topMargin;
    const lineSpacing = 1.1;
    
    const extraSpacingBetweenLines = 1.5;

    const trophyShape = document.getElementById('trophy-shape').value;
    let rightSideY = 0; // 오른쪽 영역의 Y축 시작점

    lines.forEach((line, index) => {
        if (line.trim() === '') {
            return;
        }

        let textSize;
        let textHeight = 0.25;
        let alignment;
        let fontToUse; 
        
        // 로고형일 경우 정렬 규칙 변경
        if (trophyShape === 'logo') {
            if (index === 0) { // 첫째 줄
                textSize = 5.0;
                textHeight = 0.25;
                fontToUse = fontFirstLine;
                currentY = (baseSize.y / 2) - (textSize * 0.8) - 6;
            } else if (index === 1) { // 둘째 줄
                textSize = 3.0;
                textHeight = 0.25;
                fontToUse = fontOtherLines;
                currentY = -3.0;
            } else { // 셋째 줄부터
                textSize = 1.5;
                textHeight = 0.25;
                fontToUse = fontOtherLines;
                if (index === 2) {
                    rightSideY = 10; // 셋째 줄 시작 Y 위치를 받침대 중앙으로 설정
                } else {
                    rightSideY -= (textSize + 2);
                }
                currentY = rightSideY;
            }
        } else { // 일반형일 경우 기존 정렬 규칙 유지
            if (index === 0) {
                textSize = 4.0;
                textHeight = 0.25;
                alignment = 'center';
                currentY = (baseSize.y / 2) - (textSize * 0.8) - 0.5;
                fontToUse = fontFirstLine; 
            } 
            else if (index === 1) {
                textSize = 2.0;
                alignment = 'right';
                currentY -= (textSize + lineSpacing + extraSpacingBetweenLines);
                fontToUse = fontOtherLines;
            }
            else {
                textSize = 1.5;
                alignment = 'left';
                currentY -= (textSize + lineSpacing);
                fontToUse = fontOtherLines;
            }
        }

        const textGeometry = new TextGeometry(line, {
            font: fontToUse,
            size: textSize,
            height: textHeight,
            curveSegments: 12,
        });

        const textMaterial = new THREE.MeshPhongMaterial({ color: textColor });
        const textMesh = new THREE.Mesh(textGeometry, textMaterial);
        
        textGeometry.computeBoundingBox();
        const textWidth = textGeometry.boundingBox.max.x - textGeometry.boundingBox.min.x;
        
        // 로고형일 경우, 받침대 왼쪽 1/2 영역에 가운데 정렬
        if (trophyShape === 'logo') {
            if (index < 2) {
                const leftHalfCenter = -baseSize.x / 4;
                textMesh.position.x = leftHalfCenter - (textWidth / 2);
            } else {
                // 셋째 줄부터는 오른쪽 1/2 영역에 좌측 정렬
                const rightHalfLeft = baseSize.x / 20;
                textMesh.position.x = rightHalfLeft;
            }
        } else {
            // 기존 정렬 방식 유지
            if (alignment === 'center') {
                textMesh.position.x = -textWidth / 2;
            } else if (alignment === 'right') {
                textMesh.position.x = baseSize.x / 2 - textWidth - 2.5;
            } else if (alignment === 'left') {
                textMesh.position.x = -baseSize.x / 2 + 2.5;
            }
        }

        textMesh.position.y = currentY;
        
        textGroup.add(textMesh);
    });

    textGroup.position.set(
        basePosition.x,
        basePosition.y - 1.5,
        basePosition.z + (baseSize.z / 2) + 0.1
    );
    
    currentTextMesh = textGroup;
    scene.add(currentTextMesh);
}


function loadSpecialModel(modelName) {
    loader.load(
        modelName,
        (gltf) => {
            let loadedModel = gltf.scene;
            loadedModel.name = 'special-model';
            
            if (model) {
                model.add(loadedModel);
            } else {
                console.warn("Main model not loaded. Skipping adding special model.");
                return;
            }

            // cady 오브젝트의 높이를 기준으로 스케일 조정 후 2배 키우기
            const cadyObject = model.getObjectByName('cady');
            if (cadyObject) {
                const cadyBox = new THREE.Box3().setFromObject(cadyObject);
                const cadyHeight = cadyBox.max.y - cadyBox.min.y;

                const modelBox = new THREE.Box3().setFromObject(loadedModel);
                const modelHeight = modelBox.max.y - modelBox.min.y;

                const scaleFactor = (cadyHeight / modelHeight) * 1.2;
                loadedModel.scale.set(scaleFactor, scaleFactor, scaleFactor);
            }
            loadedModel.rotation.y = Math.PI * 2 ;
            
            // 특수 모델 위치 조정
            const grass2 = model.getObjectByName('grass2');
            if (grass2) {
                const grassBox = new THREE.Box3().setFromObject(grass2);
                const grassSize = new THREE.Vector3();
                grassBox.getSize(grassSize);
                const grassCenter = new THREE.Vector3();
                grassBox.getCenter(grassCenter);
                
                loadedModel.position.set(
                    -grassSize.x / 2 - 65,
                    grassCenter.y,
                    grassCenter.z
                );
            }
        },
        undefined,
        (error) => {
            console.error(`An error happened loading the ${modelName} model`, error);
        }
    );
}

// Function to handle purpose change and automatically update text
function handlePurposeChange() {
    const trophyPurpose = document.getElementById('trophy-purpose').value;
    const trophyShape = document.getElementById('trophy-shape').value;
    
    // 이전에 로드된 특수 모델이 있다면 이름으로 찾아서 제거합니다.
    if (model) {
        const existingSpecialModel = model.getObjectByName('special-model');
        if (existingSpecialModel) {
            model.remove(existingSpecialModel);
        }
    }
    
    // 로고형에서 특정 용도를 선택했을 때만 모델 로드
    if (trophyShape === 'logo' && model) {
        if (trophyPurpose === 'hole-in-one') {
            loadSpecialModel('holeinone.glb');
        } else if (trophyPurpose === 'eagle') {
            loadSpecialModel('eagle.glb');
        } else if (trophyPurpose === 'single') {
            loadSpecialModel('single.glb');
        }
    }
    
    // 텍스트 내용 업데이트
    if (trophyPurpose === 'direct-input') {
        engravingTextarea.value = '';
        fixedFirstLine = '';
    } else {
        const fullText = engravingData[trophyPurpose];
        if (fullText) {
            const lines = fullText.split('\n');
            fixedFirstLine = lines[0] || '';
            engravingTextarea.value = fullText;
        }
    }
    
    updateTrophyText();
}

// textarea의 'input' 이벤트 리스너를 추가하여 첫 번째 줄 수정 방지
engravingTextarea.addEventListener('input', (event) => {
    // 고정된 첫 번째 줄이 있을 경우에만 로직 실행
    if (fixedFirstLine !== '') {
        const currentText = event.target.value;
        const currentLines = currentText.split('\n');
        
        // 현재 텍스트의 첫 번째 줄이 고정 문구와 다른지 확인
        if (currentLines[0] !== fixedFirstLine) {
            // 커서 위치 저장
            const cursorPosition = event.target.selectionStart;
            
            // 텍스트를 고정 문구 + 나머지 줄로 재구성
            const restOfText = currentLines.slice(1).join('\n');
            event.target.value = `${fixedFirstLine}\n${restOfText}`;
            
            // 커서 위치 복원 (첫 줄의 길이만큼 조정)
            event.target.selectionStart = cursorPosition;
            event.target.selectionEnd = cursorPosition;
        }
    }
    updateTrophyText(); // 3D 모델 텍스트 업데이트
});


function updateClubDisplay(selectedClub) {
    if (modelParts.iron) {
        modelParts.iron.visible = (selectedClub === 'iron');
    }
    if (modelParts.driver) {
        modelParts.driver.visible = (selectedClub === 'driver');
    }
}

// ========== 5. Price Update and Utilities ==========
function updateSizeOptions() {
    const trophyShape = document.getElementById('trophy-shape').value;
    const sizeSelect = document.getElementById('trophy-size');
    sizeSelect.innerHTML = '';
    
    if (priceData[trophyShape]) {
        for (const size in priceData[trophyShape]) {
            const option = document.createElement('option');
            option.value = size;
            option.textContent = size;
            sizeSelect.appendChild(option);
        }
    }
    updatePrice();
}

function updatePrice() {
    const trophyShape = document.getElementById('trophy-shape').value;
    const trophySize = document.getElementById('trophy-size').value;
    const finalPriceElement = document.getElementById('final-price');
    const priceTableBody = document.querySelector('#price-table tbody');

    priceTableBody.innerHTML = '';
    if (priceData[trophyShape]) {
        for (const size in priceData[trophyShape]) {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${size}</td><td>${priceData[trophyShape][size]}</td>`;
            priceTableBody.appendChild(row);
        }
    }
    
    if (priceData[trophyShape] && priceData[trophyShape][trophySize]) {
        finalPriceElement.textContent = priceData[trophyShape][trophySize];
    } else {
        finalPriceElement.textContent = '가격 정보 없음';
    }
}

function updatePoseOptions() {
    const poseSelect = document.getElementById('figure-pose');
    poseSelect.innerHTML = '';
    for (const poseName in poseData) {
        const option = document.createElement('option');
        option.value = poseName;
        option.textContent = poseName;
        poseSelect.appendChild(option);
    }
}

function showLoadingSpinner() {
    loadingSpinner.style.display = 'block';
}

function hideLoadingSpinner() {
    loadingSpinner.style.display = 'none';
}

function setStatusMessage(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.style.display = message ? 'block' : 'none';
    statusMessage.style.backgroundColor = isError ? 'rgba(255, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.5)';
}

function onWindowResize() {
    camera.aspect = viewerContainer.clientWidth / viewerContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(viewerContainer.clientWidth, viewerContainer.clientHeight);
    if (model) {
        fitCameraToModel();
    }
}

function fitCameraToModel() {
    if (!model) return;

    const boundingBox = new THREE.Box3().setFromObject(model);
    if (newGrassBaseMesh) {
        boundingBox.union(new THREE.Box3().setFromObject(newGrassBaseMesh));
    }
    
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    boundingBox.getCenter(center);
    boundingBox.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    
    let cameraZ = Math.abs(size.y / (2 * Math.tan(fov / 2)));
    const aspectRatio = viewerContainer.clientWidth / viewerContainer.clientHeight;
    if (size.x / size.y > aspectRatio) {
        cameraZ = Math.abs(size.x / (2 * Math.tan(fov / 2))) / aspectRatio;
    }
    
    cameraZ *= 1.25;
    
    camera.position.set(center.x, center.y, center.z + cameraZ);
    camera.lookAt(center);

    controls.target.copy(center);
    controls.update();
}


// ========== 6. Event Listeners ==========
document.getElementById('trophy-shape').addEventListener('change', (event) => {
    updateSizeOptions();
    const currentPose = document.getElementById('figure-pose').value;
    loadModel(event.target.value, currentPose);
    handlePurposeChange(); // 'trophy-shape' 변경 시에도 용도에 맞게 텍스트/홀인원 모델을 업데이트
});

document.getElementById('trophy-purpose').addEventListener('change', handlePurposeChange);
document.getElementById('engraving-text').addEventListener('input', updateTrophyText);

document.getElementById('figure-pose').addEventListener('change', (event) => {
    const currentShape = document.getElementById('trophy-shape').value;
    loadModel(currentShape, event.target.value);
});

document.getElementById('shirt-color').addEventListener('input', updateTrophyColors);
document.getElementById('pants-color').addEventListener('input', updateTrophyColors);
document.getElementById('pedestal-text-color').addEventListener('input', updateTrophyText);
document.getElementById('club-selection').addEventListener('change', (e) => {
    updateClubDisplay(e.target.value);
});
document.getElementById('trophy-size').addEventListener('change', updatePrice);

document.getElementById('order-button').addEventListener('click', () => {
    const options = {
        trophyShape: document.getElementById('trophy-shape').value,
        trophyPurpose: document.getElementById('trophy-purpose').value,
        trophySize: document.getElementById('trophy-size').value,
        trophyPrice: document.getElementById('final-price').textContent,
        figurePose: document.getElementById('figure-pose').value,
        shirtColor: document.getElementById('shirt-color').value,
        pantsColor: document.getElementById('pants-color').value,
        clubSelection: document.getElementById('club-selection').value,
        engravingText: document.getElementById('engraving-text').value,
        pedestalTextColor: document.getElementById('pedestal-text-color').value,
    };
    
    const optionsJson = JSON.stringify(options, null, 2);
    const previewImage = renderer.domElement.toDataURL('image/png');
    
    const outputDiv = document.getElementById('order-data-output');
    outputDiv.querySelector('pre').textContent = optionsJson;
    outputDiv.querySelector('img').src = previewImage;
    console.log("주문 데이터:", options);
});


// ========== 7. Rendering Loop and Initialization ==========
function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
}

init();