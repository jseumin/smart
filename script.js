// ⚠️ 발급받은 Make.com Webhook URL을 이곳에 적어주세요.
const MAKE_WEBHOOK_URL = 'https://hook.eu1.make.com/c84w4oau3tbwgvvygf8igx6i7oprxuuj';

let userEmail = "";
let foodItems = [];
let syncInterval = null;

// DOM 요소 세팅
const authScreen = document.getElementById('auth-screen');
const mainScreen = document.getElementById('main-screen');
const emailInput = document.getElementById('user-email');
const displayEmail = document.getElementById('display-email');
const searchInput = document.getElementById('search-input');
const foodList = document.getElementById('food-list');

// 버튼 요소 세팅
const btnLogin = document.getElementById('btn-login');
const btnAdd = document.getElementById('btn-add');

/* ==========================================================================
   1. 로그인 및 SPA 화면 전환 구조
   ========================================================================== */
function handleLogin() {
    const email = emailInput.value.trim();
    if (!email || !validateEmail(email)) {
        alert("올바른 이메일 주소를 입력해 주세요.");
        return;
    }
    userEmail = email;
    displayEmail.textContent = userEmail;

    // SPA 화면 전환
    authScreen.classList.remove('active');
    mainScreen.classList.add('active');

    // 첫 데이터 조회 및 5초 주기 자동 동기화 시작
    fetchFoodList();
    syncInterval = setInterval(fetchFoodList, 5000);
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// 이메일 입력 Enter 키 지원
emailInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });
btnLogin.addEventListener('click', handleLogin);


/* ==========================================================================
   2. 데이터 추가 (C) 및 조회 (R) 연동
   ========================================================================== */

// 식재료 추가 함수 (★ 하단 iframe에 구글 시트를 고정 출력하는 로직)
async function addFoodItem() {
    const nameInput = document.getElementById('food-name');
    const qtyInput = document.getElementById('food-qty');
    const expiryInput = document.getElementById('food-expiry');

    const name = nameInput.value.trim();
    const quantity = parseInt(qtyInput.value) || 1;
    const expiryDate = expiryInput.value;

    if (!name || !expiryDate) {
        alert("식재료 이름과 소비기한을 입력해주세요.");
        return;
    }

    const payload = {
        email: userEmail,
        name: name,
        quantity: quantity,
        expiryDate: expiryDate
    };

    try {
        const response = await fetch(MAKE_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        // 💡 Make 응답에서 구글 시트 주소(sheetUrl)를 받아와 웹 화면 하단 iframe에 노출
        if (response.ok) {
            const data = await response.json();
            if (data && data.sheetUrl) {
                const sheetIframe = document.getElementById('sheet-iframe');
                if (sheetIframe) {
                    sheetIframe.src = data.sheetUrl; // iframe 주소를 구글 시트 링크로 변경
                    sheetIframe.style.display = 'block'; // 숨겨져 있던 iframe을 표시
                }
            }
        }

        // 입력 폼 초기화
        nameInput.value = "";
        qtyInput.value = 1;
        expiryInput.value = "";

        // 등록 후 즉시 최신화 호출
        fetchFoodList();
    } catch (error) {
        console.error("데이터 저장 실패:", error);
    }
}

// 식재료 조회 함수 (★ undefined 데이터 오염 방지 가드 코드 추가)
async function fetchFoodList() {
    if (!userEmail) return;

    try {
        const response = await fetch(`${MAKE_WEBHOOK_URL}?email=${encodeURIComponent(userEmail)}&action=read`);
        if (!response.ok) throw new Error("네트워크 응답 오류");
        
        const data = await response.json();
        
        // 💡 만약 Make에서 데이터 목록이 아니라 sheetUrl 응답만 넘어왔다면, 리스트 렌더링을 스킵하여 안전하게 가드합니다.
        if (data && data.sheetUrl && !data.items) {
            return; 
        }

        foodItems = data.items || [];
        renderFoodList(foodItems);
    } catch (error) {
        console.error("데이터 동기화 실패:", error);
    }
}

// 메인 추가 입력란 Enter 키 지원 
document.getElementById('food-name').addEventListener('keypress', (e) => { if (e.key === 'Enter') addFoodItem(); });
document.getElementById('food-qty').addEventListener('keypress', (e) => { if (e.key === 'Enter') addFoodItem(); });
document.getElementById('food-expiry').addEventListener('keypress', (e) => { if (e.key === 'Enter') addFoodItem(); });
btnAdd.addEventListener('click', addFoodItem);


/* ==========================================================================
   3. 데이터 렌더링, D-Day 계산 및 검색 필터링
   ========================================================================== */

function renderFoodList(items) {
    foodList.innerHTML = "";
    
    // 안전한 배열 검사 추가
    if (!Array.isArray(items)) return;

    // 실시간 검색어 필터링 적용
    const keyword = searchInput.value.toLowerCase().trim();
    const filteredItems = items.filter(item => item && item.name && item.name.toLowerCase().includes(keyword));

    if (filteredItems.length === 0) {
        foodList.innerHTML = `<div class="loading">등록된 식재료가 없거나 검색 결과가 없습니다.</div>`;
        return;
    }

    filteredItems.forEach(item => {
        const card = document.createElement('div');
        card.classList.add('food-item');

        const dday = calculateDDay(item.expiryDate);
        
        if (dday <= 3) {
            card.classList.add('dday-danger');
        } else if (dday <= 7) {
            card.classList.add('dday-warning');
        } else {
            card.classList.add('dday-safe');
        }

        let ddayText = `D-${dday}`;
        if (dday === 0) ddayText = "D-Day";
        if (dday < 0) ddayText = `D+${Math.abs(dday)} (기한 지남)`;

        card.innerHTML = `
            <div class="food-info">
                <span class="name">${escapeHtml(item.name)}</span>
                <span class="details">수량: ${item.quantity}개 / 기한: ${item.expiryDate}</span>
            </div>
            <div class="food-status">
                <span class="dday">${ddayText}</span>
            </div>
        `;
        foodList.appendChild(card);
    });
}

function calculateDDay(expiryDateString) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDateString);
    expiry.setHours(0, 0, 0, 0);

    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function escapeHtml(text) {
    if (!text) return "";
    return text.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

searchInput.addEventListener('input', () => renderFoodList(foodItems));
