// ============================================
// SUPABASE CONFIGURATION
// ============================================
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
let currentUser = null;
let order = null;
let orderItems = [];
let currentStep = 1;

// Rating data
let ratings = {
    supplier: {
        communication: 0,
        shipping: 0,
        service: 0,
        recommend: null,
        comments: ''
    },
    products: {},
    finalComments: ''
};

// Get order ID from URL
const urlParams = new URLSearchParams(window.location.search);
const orderId = urlParams.get('id');

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    
    if (!orderId) {
        showToast('No order specified');
        setTimeout(() => window.location.href = 'orders.html', 2000);
        return;
    }
    
    await loadOrderDetails();
    setupEventListeners();
    updateStep(1);
});

// ============================================
// AUTHENTICATION
// ============================================
async function checkAuth() {
    try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) {
            window.location.href = 'login.html?redirect=rate-transaction.html?id=' + orderId;
            return;
        }
        currentUser = user;
    } catch (error) {
        console.error('Auth error:', error);
        window.location.href = 'login.html';
    }
}

// ============================================
// LOAD ORDER DETAILS
// ============================================
async function loadOrderDetails() {
    showLoading(true);
    
    try {
        const { data, error } = await sb
            .from('orders')
            .select(`
                *,
                suppliers!orders_supplier_id_fkey (
                    id,
                    business_name,
                    verification_status,
                    profiles!suppliers_profile_id_fkey (
                        avatar_url,
                        location
                    )
                ),
                order_items (*)
            `)
            .eq('id', orderId)
            .eq('buyer_id', currentUser.id)
            .single();
            
        if (error) throw error;
        
        order = data;
        orderItems = data.order_items || [];
        
        // Check if already rated
        const { data: existingReview } = await sb
            .from('reviews')
            .select('id')
            .eq('order_id', orderId)
            .eq('reviewer_id', currentUser.id)
            .maybeSingle();
            
        if (existingReview) {
            showToast('You have already rated this order');
            setTimeout(() => window.location.href = 'orders.html', 2000);
            return;
        }
        
        renderOrderSummary();
        renderSupplierInfo();
        renderProductRatingList();
        
    } catch (error) {
        console.error('Error loading order:', error);
        showToast('Failed to load order details');
        setTimeout(() => window.location.href = 'orders.html', 2000);
    } finally {
        showLoading(false);
    }
}

// ============================================
// RENDER FUNCTIONS
// ============================================
function renderOrderSummary() {
    const container = document.getElementById('orderSummary');
    
    container.innerHTML = `
        <div class="order-summary-header">
            <span class="order-number">Order #${order.order_number}</span>
            <span class="order-date">${formatDate(order.created_at)}</span>
        </div>
        <div class="order-summary-details">
            <div class="summary-detail">
                <i class="fas fa-box"></i>
                <span>${orderItems.length} item${orderItems.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="summary-detail">
                <i class="fas fa-tag"></i>
                <span>UGX ${formatNumber(order.total_amount)}</span>
            </div>
            <div class="summary-detail">
                <i class="fas fa-clock"></i>
                <span>Delivered ${formatTimeAgo(order.delivered_at)}</span>
            </div>
        </div>
    `;
}

function renderSupplierInfo() {
    const container = document.getElementById('supplierInfo');
    const supplier = order.suppliers;
    const profile = supplier?.profiles || {};
    const supplierName = supplier?.business_name || 'Supplier';
    const initials = getInitials(supplierName);
    
    container.innerHTML = `
        <div class="supplier-avatar">
            ${profile.avatar_url ? 
                `<img src="${profile.avatar_url}" alt="${supplierName}">` : 
                initials
            }
        </div>
        <div class="supplier-details">
            <div class="supplier-name">
                ${escapeHtml(supplierName)}
                ${supplier?.verification_status === 'verified' ? 
                    '<i class="fas fa-check-circle verified-badge"></i>' : ''
                }
            </div>
            <div class="supplier-meta">
                <span><i class="fas fa-map-marker-alt"></i> ${profile.location || 'Uganda'}</span>
            </div>
        </div>
    `;
}

function renderProductRatingList() {
    const container = document.getElementById('productsRatingList');
    
    container.innerHTML = orderItems.map((item, index) => {
        // Initialize product ratings
        if (!ratings.products[item.id]) {
            ratings.products[item.id] = {
                rating: 0,
                comments: '',
                productId: item.ad_id,
                productTitle: item.product_title,
                quantity: item.quantity
            };
        }
        
        return `
            <div class="product-rating-card" data-product-id="${item.id}">
                <div class="product-rating-header">
                    <div class="product-image">
                        <img src="${item.image_url || 'https://via.placeholder.com/60'}" alt="${escapeHtml(item.product_title)}">
                    </div>
                    <div class="product-info">
                        <div class="product-title">${escapeHtml(item.product_title)}</div>
                        ${item.product_sku ? `<div class="product-sku">SKU: ${item.product_sku}</div>` : ''}
                        <div class="product-quantity">Quantity: ${item.quantity}</div>
                    </div>
                </div>
                
                <div class="product-rating-stars" data-product="${item.id}">
                    ${[1,2,3,4,5].map(star => `
                        <i class="far fa-star" data-value="${star}"></i>
                    `).join('')}
                </div>
                
                <div class="product-comments">
                    <textarea 
                        placeholder="Comments about this product (optional)"
                        data-product-id="${item.id}"
                        rows="2">${ratings.products[item.id].comments}</textarea>
                </div>
            </div>
        `;
    }).join('');
    
    // Attach star rating listeners for products
    attachProductStarListeners();
}

function attachProductStarListeners() {
    document.querySelectorAll('.product-rating-stars i').forEach(star => {
        star.addEventListener('mouseenter', handleProductStarHover);
        star.addEventListener('mouseleave', handleProductStarLeave);
        star.addEventListener('click', handleProductStarClick);
    });
}

function renderReviewSummary() {
    // Supplier review summary
    const supplierContainer = document.getElementById('reviewSupplier');
    const supplier = order.suppliers;
    const supplierName = supplier?.business_name || 'Supplier';
    
    supplierContainer.innerHTML = `
        <div class="review-supplier">
            <div class="review-supplier-avatar">
                ${getInitials(supplierName)}
            </div>
            <div class="review-supplier-info">
                <div class="review-supplier-name">${escapeHtml(supplierName)}</div>
                <div class="review-supplier-ratings">
                    <span class="rating-item">
                        <i class="fas fa-star"></i> ${ratings.supplier.communication}/5
                    </span>
                    <span class="rating-item">
                        <i class="fas fa-truck"></i> ${ratings.supplier.shipping}/5
                    </span>
                    <span class="rating-item">
                        <i class="fas fa-headset"></i> ${ratings.supplier.service}/5
                    </span>
                </div>
                ${ratings.supplier.recommend ? `
                    <div class="recommend-badge">
                        <i class="fas fa-${ratings.supplier.recommend === 'yes' ? 'thumbs-up' : 'thumbs-down'}"></i>
                        ${ratings.supplier.recommend === 'yes' ? 'Would recommend' : 'Would not recommend'}
                    </div>
                ` : ''}
            </div>
        </div>
        ${ratings.supplier.comments ? `
            <div class="review-comments">
                <strong>Supplier comments:</strong>
                <p>${escapeHtml(ratings.supplier.comments)}</p>
            </div>
        ` : ''}
    `;
    
    // Products review summary
    const productsContainer = document.getElementById('reviewProducts');
    
    productsContainer.innerHTML = orderItems.map(item => {
        const productRating = ratings.products[item.id] || { rating: 0, comments: '' };
        
        return `
            <div class="review-product-item">
                <div>
                    <span class="review-product-name">${escapeHtml(item.product_title)}</span>
                    ${productRating.comments ? `<br><small>${escapeHtml(productRating.comments)}</small>` : ''}
                </div>
                <span class="review-product-rating">
                    ${productRating.rating}/5 ⭐
                </span>
            </div>
        `;
    }).join('');
    
    // Comments
    const commentsContainer = document.getElementById('reviewComments');
    commentsContainer.innerHTML = ratings.finalComments || '<p class="text-muted">No additional comments</p>';
}

// ============================================
// STAR RATING HANDLERS (Supplier)
// ============================================
document.querySelectorAll('.rating-stars i').forEach(star => {
    star.addEventListener('mouseenter', handleStarHover);
    star.addEventListener('mouseleave', handleStarLeave);
    star.addEventListener('click', handleStarClick);
});

function handleStarHover(e) {
    const container = e.target.closest('.rating-stars');
    const value = parseInt(e.target.dataset.value);
    const criteria = container.dataset.criteria;
    
    container.querySelectorAll('i').forEach((s, index) => {
        if (index < value) {
            s.classList.remove('far');
            s.classList.add('fas', 'hover');
        }
    });
}

function handleStarLeave(e) {
    const container = e.target.closest('.rating-stars');
    const criteria = container.dataset.criteria;
    const currentValue = ratings.supplier[criteria] || 0;
    
    container.querySelectorAll('i').forEach((s, index) => {
        s.classList.remove('fas', 'hover');
        s.classList.add('far');
        
        if (index < currentValue) {
            s.classList.remove('far');
            s.classList.add('fas', 'active');
        }
    });
}

function handleStarClick(e) {
    const container = e.target.closest('.rating-stars');
    const value = parseInt(e.target.dataset.value);
    const criteria = container.dataset.criteria;
    
    ratings.supplier[criteria] = value;
    
    // Update display
    container.querySelectorAll('i').forEach((s, index) => {
        s.classList.remove('fas', 'active', 'hover');
        s.classList.add('far');
        
        if (index < value) {
            s.classList.remove('far');
            s.classList.add('fas', 'active');
        }
    });
    
    // Update score display
    document.getElementById(`${criteria}Score`).textContent = `${value}/5`;
    
    validateStep1();
}

// ============================================
// PRODUCT STAR HANDLERS
// ============================================
function handleProductStarHover(e) {
    const container = e.target.closest('.product-rating-stars');
    const value = parseInt(e.target.dataset.value);
    
    container.querySelectorAll('i').forEach((s, index) => {
        if (index < value) {
            s.classList.remove('far');
            s.classList.add('fas', 'hover');
        }
    });
}

function handleProductStarLeave(e) {
    const container = e.target.closest('.product-rating-stars');
    const productId = container.dataset.product;
    const currentValue = ratings.products[productId]?.rating || 0;
    
    container.querySelectorAll('i').forEach((s, index) => {
        s.classList.remove('fas', 'hover');
        s.classList.add('far');
        
        if (index < currentValue) {
            s.classList.remove('far');
            s.classList.add('fas', 'active');
        }
    });
}

function handleProductStarClick(e) {
    const container = e.target.closest('.product-rating-stars');
    const value = parseInt(e.target.dataset.value);
    const productId = container.dataset.product;
    
    if (!ratings.products[productId]) {
        ratings.products[productId] = { rating: 0, comments: '' };
    }
    
    ratings.products[productId].rating = value;
    
    // Update display
    container.querySelectorAll('i').forEach((s, index) => {
        s.classList.remove('fas', 'active', 'hover');
        s.classList.add('far');
        
        if (index < value) {
            s.classList.remove('far');
            s.classList.add('fas', 'active');
        }
    });
    
    validateStep2();
}

// ============================================
// VALIDATION FUNCTIONS
// ============================================
function validateStep1() {
    const continueBtn = document.getElementById('continueToStep2');
    const recommend = document.querySelector('input[name="recommendSupplier"]:checked');
    
    const isValid = ratings.supplier.communication > 0 &&
                   ratings.supplier.shipping > 0 &&
                   ratings.supplier.service > 0 &&
                   recommend !== null;
    
    if (recommend) {
        ratings.supplier.recommend = recommend.value;
    }
    
    continueBtn.disabled = !isValid;
}

function validateStep2() {
    const continueBtn = document.getElementById('continueToStep3');
    
    // Check if all products have ratings
    const allRated = orderItems.every(item => 
        ratings.products[item.id] && ratings.products[item.id].rating > 0
    );
    
    continueBtn.disabled = !allRated;
}

function validateStep3() {
    const submitBtn = document.getElementById('submitRatingBtn');
    const termsCheck = document.getElementById('acceptTerms');
    
    submitBtn.disabled = !termsCheck.checked;
}

// ============================================
// STEP NAVIGATION
// ============================================
function updateStep(step) {
    currentStep = step;
    
    // Update step indicators
    for (let i = 1; i <= 3; i++) {
        const indicator = document.getElementById(`step${i}Indicator`);
        if (indicator) {
            indicator.classList.remove('active', 'completed');
            
            if (i === step) {
                indicator.classList.add('active');
            } else if (i < step) {
                indicator.classList.add('completed');
            }
        }
    }
    
    // Show/hide step content
    for (let i = 1; i <= 3; i++) {
        const content = document.getElementById(`step${i}`);
        if (content) {
            content.classList.toggle('active', i === step);
        }
    }
    
    // Step-specific initialization
    if (step === 2) {
        validateStep2();
    } else if (step === 3) {
        renderReviewSummary();
        validateStep3();
    }
}

// ============================================
// SUBMIT RATINGS
// ============================================
async function submitRatings() {
    const submitBtn = document.getElementById('submitRatingBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    
    try {
        // Collect final comments
        ratings.finalComments = document.getElementById('finalComments').value;
        
        // Calculate average supplier rating
        const supplierRating = (
            ratings.supplier.communication +
            ratings.supplier.shipping +
            ratings.supplier.service
        ) / 3;
        
        // Insert supplier review
        const { data: review, error: reviewError } = await sb
            .from('reviews')
            .insert({
                order_id: orderId,
                reviewer_id: currentUser.id,
                reviewee_id: order.supplier_id,
                review_type: 'supplier',
                rating: Math.round(supplierRating * 10) / 10,
                communication_rating: ratings.supplier.communication,
                delivery_rating: ratings.supplier.shipping,
                quality_rating: ratings.supplier.service,
                title: `Review for ${order.suppliers?.business_name}`,
                comment: ratings.supplier.comments,
                is_verified_purchase: true,
                is_public: true,
                created_at: new Date().toISOString()
            })
            .select()
            .single();
            
        if (reviewError) throw reviewError;
        
        // Insert product reviews
        for (const [itemId, productRating] of Object.entries(ratings.products)) {
            const orderItem = orderItems.find(i => i.id === parseInt(itemId));
            
            if (orderItem) {
                const { error: productError } = await sb
                    .from('reviews')
                    .insert({
                        order_id: orderId,
                        reviewer_id: currentUser.id,
                        reviewee_id: order.supplier_id,
                        review_type: 'product',
                        ad_id: orderItem.ad_id,
                        rating: productRating.rating,
                        title: `Review for ${orderItem.product_title}`,
                        comment: productRating.comments,
                        is_verified_purchase: true,
                        is_public: true,
                        created_at: new Date().toISOString()
                    });
                    
                if (productError) throw productError;
            }
        }
        
        // Update supplier performance metrics
        await updateSupplierMetrics(order.supplier_id);
        
        // Show thank you modal
        document.getElementById('thankYouModal').classList.add('show');
        
    } catch (error) {
        console.error('Error submitting ratings:', error);
        showToast('Failed to submit ratings. Please try again.');
        
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Ratings';
    }
}

async function updateSupplierMetrics(supplierId) {
    try {
        // Get all reviews for this supplier
        const { data: reviews } = await sb
            .from('reviews')
            .select('rating, communication_rating, delivery_rating, quality_rating')
            .eq('reviewee_id', supplierId)
            .eq('review_type', 'supplier');
            
        if (reviews && reviews.length > 0) {
            const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
            const avgComm = reviews.reduce((sum, r) => sum + (r.communication_rating || 0), 0) / reviews.length;
            const avgDelivery = reviews.reduce((sum, r) => sum + (r.delivery_rating || 0), 0) / reviews.length;
            const avgQuality = reviews.reduce((sum, r) => sum + (r.quality_rating || 0), 0) / reviews.length;
            
            // Update supplier table (you may need to add these columns)
            await sb
                .from('suppliers')
                .update({
                    avg_rating: avgRating,
                    avg_communication: avgComm,
                    avg_delivery: avgDelivery,
                    avg_quality: avgQuality,
                    total_reviews: reviews.length
                })
                .eq('id', supplierId);
        }
        
    } catch (error) {
        console.error('Error updating supplier metrics:', error);
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function showLoading(show) {
    document.getElementById('loadingState').style.display = show ? 'flex' : 'none';
}

function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function formatNumber(num) {
    return num?.toLocaleString('en-UG') || '0';
}

function formatDate(dateString) {
    return moment(dateString).format('MMM D, YYYY');
}

function formatTimeAgo(dateString) {
    return moment(dateString).fromNow();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Step navigation
    document.getElementById('continueToStep2')?.addEventListener('click', () => {
        // Save supplier comments
        ratings.supplier.comments = document.getElementById('supplierComments').value;
        updateStep(2);
    });
    
    document.getElementById('continueToStep3')?.addEventListener('click', () => {
        // Save product comments
        document.querySelectorAll('.product-comments textarea').forEach(textarea => {
            const productId = textarea.dataset.productId;
            if (ratings.products[productId]) {
                ratings.products[productId].comments = textarea.value;
            }
        });
        
        updateStep(3);
    });
    
    document.getElementById('backToStep1')?.addEventListener('click', () => updateStep(1));
    document.getElementById('backToStep2')?.addEventListener('click', () => updateStep(2));
    
    // Recommend supplier radio buttons
    document.querySelectorAll('input[name="recommendSupplier"]').forEach(radio => {
        radio.addEventListener('change', validateStep1);
    });
    
    // Supplier comments
    document.getElementById('supplierComments')?.addEventListener('input', (e) => {
        ratings.supplier.comments = e.target.value;
    });
    
    // Terms checkbox
    document.getElementById('acceptTerms')?.addEventListener('change', validateStep3);
    
    // Submit button
    document.getElementById('submitRatingBtn')?.addEventListener('click', submitRatings);
    
    // Close modal
    document.getElementById('thankYouModal')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            window.location.href = 'orders.html';
        }
    });
}

// Make functions globally available
window.submitRatings = submitRatings;