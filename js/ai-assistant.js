// ============================================
// DATABASE CONFIGURATION
// ============================================

// Database 1: Training data for greetings ONLY
const TRAINING_DB_URL = 'https://kqyyhjudshjeztdlpmoa.supabase.co';
const TRAINING_DB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxeXloanVkc2hqZXp0ZGxwbW9hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNjAzMzEsImV4cCI6MjA5NTkzNjMzMX0.w8uypyF_qEp5nesKGro8x8lET7lI8rzU5MxsIKf_jxQ';

// Database 2: B2B Marketplace (Products, Suppliers)
const B2B_DB_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const B2B_DB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const trainingDb = supabase.createClient(TRAINING_DB_URL, TRAINING_DB_KEY);
const b2bDb = supabase.createClient(B2B_DB_URL, B2B_DB_KEY);

// ============================================
// CACHED DATA (to avoid repeated API calls)
// ============================================
let cachedProducts = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// ============================================
// GREETING RESPONSES (Database 1)
// ============================================

function getGreetingResponse(input) {
    const lower = input.toLowerCase().trim();
    
    const greetings = ['hello', 'hi', 'hey', 'howdy', 'greetings', 'good morning', 'good afternoon', 'good evening'];
    const farewells = ['goodbye', 'bye', 'see you', 'farewell', 'bye bye'];
    const thanks = ['thank', 'thanks', 'appreciate'];
    const howAreYou = ['how are you', "how're you", "how you doing"];
    
    if (greetings.some(g => lower === g || lower.startsWith(g))) {
        return "Hello! Welcome to BuyUganda. What products are you looking for today?";
    }
    if (farewells.some(f => lower.includes(f))) {
        return "Goodbye! Come back anytime to shop on BuyUganda!";
    }
    if (thanks.some(t => lower.includes(t))) {
        return "You're very welcome! Need help finding anything else?";
    }
    if (howAreYou.some(h => lower.includes(h))) {
        return "I'm doing great! Ready to help you find products on BuyUganda. What are you looking for?";
    }
    
    return null;
}

// ============================================
// FETCH ALL PRODUCTS FROM B2B DATABASE
// ============================================

async function fetchAllProducts() {
    const now = Date.now();
    
    // Return cached data if still fresh
    if (cachedProducts && (now - lastFetchTime) < CACHE_DURATION) {
        console.log(`📦 Using cached products (${cachedProducts.length} items)`);
        return cachedProducts;
    }
    
    try {
        console.log('🔄 Fetching products from database...');
        
        const { data, error } = await b2bDb
            .from('ads')
            .select('id, title, description, wholesale_price, price, image_urls, moq, is_featured, status')
            .eq('status', 'active')
            .limit(500);
        
        if (error) {
            console.error('Database error:', error);
            return [];
        }
        
        cachedProducts = data || [];
        lastFetchTime = now;
        console.log(`✅ Loaded ${cachedProducts.length} products from database`);
        return cachedProducts;
        
    } catch (e) {
        console.error('Fetch error:', e);
        return [];
    }
}

// ============================================
// SMART PRODUCT SEARCH (with proper filtering)
// ============================================

function calculateRelevanceScore(product, searchTerm) {
    const titleLower = product.title.toLowerCase();
    const descLower = (product.description || '').toLowerCase();
    const searchLower = searchTerm.toLowerCase();
    const searchWords = searchLower.split(/\s+/);
    
    let score = 0;
    
    // Exact title match (highest)
    if (titleLower === searchLower) {
        score = 100;
    }
    // Title contains exact phrase
    else if (titleLower.includes(searchLower)) {
        score = 90;
    }
    // Title contains all words
    else {
        let allWordsMatch = true;
        let wordMatches = 0;
        
        for (const word of searchWords) {
            if (word.length < 2) continue;
            if (titleLower.includes(word)) {
                wordMatches++;
            } else {
                allWordsMatch = false;
            }
        }
        
        if (allWordsMatch && searchWords.length > 1) {
            score = 80;
        } else if (wordMatches > 0) {
            score = 60 + (wordMatches / searchWords.length) * 20;
        }
    }
    
    // Check description for matches (lower priority)
    if (score < 80 && descLower.includes(searchLower)) {
        score = 50;
    } else if (score < 60) {
        for (const word of searchWords) {
            if (word.length > 2 && descLower.includes(word)) {
                score += 10;
            }
        }
    }
    
    // Bonus for featured products
    if (product.is_featured) {
        score += 5;
    }
    
    // Bonus for having wholesale price
    if (product.wholesale_price) {
        score += 3;
    }
    
    return Math.min(score, 100);
}

async function searchProducts(searchTerm, limit = 20) {
    if (!searchTerm || searchTerm.trim().length < 2) {
        return [];
    }
    
    const allProducts = await fetchAllProducts();
    
    if (allProducts.length === 0) {
        return [];
    }
    
    console.log(`🔍 Searching for: "${searchTerm}" among ${allProducts.length} products`);
    
    // Calculate relevance scores for all products
    const scoredProducts = allProducts.map(product => ({
        product,
        score: calculateRelevanceScore(product, searchTerm)
    }));
    
    // Filter products with score > 0 and sort by score
    const matches = scoredProducts
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(item => item.product);
    
    console.log(`✅ Found ${matches.length} relevant products for "${searchTerm}"`);
    
    // Log top matches for debugging
    if (matches.length > 0) {
        console.log('Top matches:', matches.slice(0, 3).map(p => ({
            title: p.title,
            score: calculateRelevanceScore(p, searchTerm)
        })));
    }
    
    return matches;
}

// ============================================
// OTHER B2B DATABASE FUNCTIONS
// ============================================

async function getFeaturedProducts(limit = 12) {
    const allProducts = await fetchAllProducts();
    const featured = allProducts.filter(p => p.is_featured === true);
    return featured.slice(0, limit);
}

async function getSuppliers(limit = 6) {
    try {
        const { data, error } = await b2bDb
            .from('suppliers')
            .select('id, business_name, verification_status')
            .eq('verification_status', 'verified')
            .limit(limit);
        
        if (error) return [];
        return data || [];
    } catch(e) { 
        console.error('Supplier fetch error:', e);
        return []; 
    }
}

// ============================================
// MAIN PROCESSING
// ============================================

async function processQuery(userInput) {
    const lower = userInput.toLowerCase().trim();
    
    // Step 1: Check for greetings (Database 1)
    const greetingResponse = getGreetingResponse(userInput);
    if (greetingResponse) {
        console.log('💬 Greeting response');
        return { text: greetingResponse, products: null, suppliers: null };
    }
    
    // Step 2: Suppliers request
    if (lower === 'suppliers' || lower === 'supplier' || lower === 'sellers' || lower === 'vendor') {
        console.log('🏭 Fetching suppliers');
        const suppliers = await getSuppliers(6);
        if (suppliers.length > 0) {
            return { text: "Here are our verified suppliers:", products: null, suppliers: suppliers };
        }
        return { text: "No suppliers found at the moment.", products: null, suppliers: null };
    }
    
    // Step 3: Featured deals
    if (lower.includes('deal') || lower.includes('featured') || lower.includes('trending') || lower === 'deals') {
        console.log('🔥 Fetching featured deals');
        const deals = await getFeaturedProducts(12);
        if (deals.length > 0) {
            return { text: "🔥 Here are today's featured deals:", products: deals, suppliers: null };
        }
        return { text: "No featured deals available at the moment.", products: null, suppliers: null };
    }
    
    // Step 4: Product search (main feature)
    if (lower.length >= 2) {
        console.log(`🔍 Searching for: "${userInput}"`);
        const products = await searchProducts(userInput, 15);
        
        if (products.length > 0) {
            if (products.length === 1) {
                const p = products[0];
                const price = p.wholesale_price || p.price;
                const desc = p.description ? p.description.substring(0, 200) : 'Contact supplier for more details.';
                return {
                    text: `**${p.title}**\n\n💰 Price: UGX ${price?.toLocaleString() || 'N/A'}\n📦 MOQ: ${p.moq || 'Contact supplier'}\n\n${desc}${desc.length > 200 ? '...' : ''}`,
                    products: products,
                    suppliers: null
                };
            }
            return {
                text: `I found ${products.length} product${products.length > 1 ? 's' : ''} matching "${userInput}":`,
                products: products,
                suppliers: null
            };
        }
    }
    
    // Step 5: No results
    return {
        text: `I couldn't find anything matching "${userInput}" in our marketplace.\n\nTry searching for:\n• "maize"\n• "beans"\n• "electronics"\n• "suppliers"\n• "featured deals"`,
        products: null,
        suppliers: null
    };
}

// ============================================
// UI COMPONENTS
// ============================================

function buildProductCarousel(products, title) {
    if (!products || products.length === 0) return '';
    
    const slides = products.map(p => {
        const imgUrl = (p.image_urls && p.image_urls[0]) || 'https://via.placeholder.com/140x100?text=Product';
        const price = p.wholesale_price || p.price;
        return `
            <div class="swiper-slide">
                <div class="product-slide">
                    <img src="${imgUrl}" alt="${escapeHtml(p.title)}" onerror="this.src='https://via.placeholder.com/140x100?text=No+Image'">
                    <div class="product-slide-title">${escapeHtml(p.title.substring(0, 30))}</div>
                    <div class="product-slide-price">UGX ${price?.toLocaleString() || 'N/A'}</div>
                    <a href="B2B-product-detail.html?id=${p.id}" class="view-product-link" target="_blank">View →</a>
                </div>
            </div>
        `;
    }).join('');
    
    return `
        <div style="margin-top: 16px;">
            <div style="font-size: 14px; color: #9B4DFF; margin-bottom: 12px;">📦 ${title || `${products.length} items found`}</div>
            <div class="swiper productSwiper" style="overflow: visible;">
                <div class="swiper-wrapper">${slides}</div>
                <div class="swiper-button-next"></div>
                <div class="swiper-button-prev"></div>
            </div>
        </div>
    `;
}

function buildSupplierList(suppliers) {
    if (!suppliers || suppliers.length === 0) return '';
    return `
        <div style="margin-top: 16px;">
            <div style="font-size: 14px; color: #9B4DFF; margin-bottom: 12px;">🏭 Verified Suppliers</div>
            ${suppliers.map(s => `
                <div class="supplier-card">
                    <div class="supplier-icon"><i class="fas fa-store"></i></div>
                    <div>
                        <div class="supplier-name">${escapeHtml(s.business_name)}</div>
                        <div class="supplier-badge">✓ Verified</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// ============================================
// CHAT UI FUNCTIONS
// ============================================

let currentSwiper = null;

function addMessage(text, sender) {
    const area = document.getElementById('messagesArea');
    const div = document.createElement('div');
    div.className = `message message-${sender}`;
    
    if (sender === 'user') {
        div.innerHTML = `<div class="message-bubble">${escapeHtml(text)}</div>`;
    } else {
        div.innerHTML = `
            <div class="assistant-avatar"><i class="fas fa-robot"></i></div>
            <div class="message-bubble">${text.replace(/\n/g, '<br>')}</div>
        `;
    }
    
    area.appendChild(div);
    scrollToBottom();
}

function addAssistantResponse(text, products, suppliers) {
    const area = document.getElementById('messagesArea');
    const div = document.createElement('div');
    div.className = 'message message-assistant';
    
    let content = `
        <div class="assistant-avatar"><i class="fas fa-robot"></i></div>
        <div class="message-bubble">${text.replace(/\n/g, '<br>')}
    `;
    
    if (products && products.length > 0) {
        if (products.length === 1) {
            const p = products[0];
            const imgUrl = (p.image_urls && p.image_urls[0]) || 'https://via.placeholder.com/80';
            const price = p.wholesale_price || p.price;
            content += `
                <div class="single-product">
                    <img src="${imgUrl}" onerror="this.src='https://via.placeholder.com/80'">
                    <div class="single-product-info">
                        <div class="single-product-title">${escapeHtml(p.title)}</div>
                        <div class="single-product-price">UGX ${price?.toLocaleString() || 'N/A'}</div>
                        <a href="B2B-product-detail.html?id=${p.id}" style="font-size:12px; color:#9B4DFF;" target="_blank">View Details →</a>
                    </div>
                </div>
            `;
        } else {
            content += buildProductCarousel(products, `${products.length} items found`);
        }
    }
    
    if (suppliers && suppliers.length > 0) {
        content += buildSupplierList(suppliers);
    }
    
    content += `</div>`;
    div.innerHTML = content;
    area.appendChild(div);
    
    // Initialize swiper for carousel
    setTimeout(() => {
        const swiperEl = div.querySelector('.productSwiper');
        if (swiperEl && products && products.length > 1) {
            if (currentSwiper) currentSwiper.destroy(true, true);
            currentSwiper = new Swiper(swiperEl, {
                slidesPerView: 2.2,
                spaceBetween: 12,
                navigation: { nextEl: '.swiper-button-next', prevEl: '.swiper-button-prev' },
                breakpoints: { 
                    480: { slidesPerView: 2.5 }, 
                    768: { slidesPerView: 3.5 } 
                }
            });
        }
    }, 50);
    
    scrollToBottom();
}

let typingId = null;

function showTypingIndicator() {
    const area = document.getElementById('messagesArea');
    const id = 'typing-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = 'message message-assistant';
    div.innerHTML = `
        <div class="assistant-avatar"><i class="fas fa-robot"></i></div>
        <div class="message-bubble">
            <div class="typing-indicator"><span></span><span></span><span></span></div>
        </div>
    `;
    area.appendChild(div);
    scrollToBottom();
    return id;
}

function removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    addMessage(message, 'user');
    input.value = '';
    input.style.height = 'auto';
    
    const typingId = showTypingIndicator();
    const result = await processQuery(message);
    removeTypingIndicator(typingId);
    
    addAssistantResponse(result.text, result.products, result.suppliers);
}

function scrollToBottom() {
    const area = document.getElementById('messagesArea');
    area.scrollTop = area.scrollHeight;
}

function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// VOICE INPUT
// ============================================

let isRecording = false;

function setupVoiceInput() {
    const micBtn = document.getElementById('micBtn');
    
    micBtn.addEventListener('click', async () => {
        if (!isRecording) {
            try {
                const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
                recognition.lang = 'en-US';
                recognition.continuous = false;
                recognition.interimResults = false;
                
                recognition.onstart = () => {
                    isRecording = true;
                    micBtn.classList.add('recording');
                    micBtn.innerHTML = '<i class="fas fa-stop"></i>';
                };
                
                recognition.onresult = (event) => {
                    const transcript = event.results[0][0].transcript;
                    document.getElementById('chatInput').value = transcript;
                    sendMessage();
                };
                
                recognition.onerror = (event) => {
                    console.error('Recognition error:', event.error);
                    micBtn.classList.remove('recording');
                    micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                    isRecording = false;
                };
                
                recognition.onend = () => {
                    micBtn.classList.remove('recording');
                    micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                    isRecording = false;
                };
                
                recognition.start();
                
            } catch(e) {
                console.error('Voice error:', e);
                alert('Please allow microphone access to use voice input.');
            }
        } else {
            isRecording = false;
            micBtn.classList.remove('recording');
            micBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        }
    });
}

// ============================================
// AUTO-RESIZE TEXTAREA
// ============================================

function setupAutoResize() {
    const textarea = document.getElementById('chatInput');
    textarea.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });
}

// ============================================
// INITIALIZATION
// ============================================

async function init() {
    console.log('🚀 Initializing AI Assistant...');
    setupAutoResize();
    setupVoiceInput();
    
    const sendBtn = document.getElementById('sendBtn');
    const chatInput = document.getElementById('chatInput');
    
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', handleKeyPress);
    
    // Pre-fetch products for faster response
    await fetchAllProducts();
    
    console.log('✅ AI Assistant ready!');
}

// Start the app
init();