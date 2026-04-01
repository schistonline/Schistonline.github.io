// ============================================
// BOOKING PAGE - PRODUCTION VERSION
// ============================================

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
let currentUser = null;
let currentBatch = null;
let currentBooking = null;
let quantity = 1;
let minOrder = 1;
let maxOrder = 999;
let pricePerBird = 0;

// Get batch ID from URL
const urlParams = new URLSearchParams(window.location.search);
const batchId = urlParams.get('batch');

// ============================================
// INITIALIZATION
//=============================================
document.addEventListener('DOMContentLoaded', async function() {
    showLoading();
    
    if (!batchId) {
        showToast('No batch selected', 'error');
        setTimeout(() => {
            window.location.href = 'poultry-listings.html';
        }, 2000);
        return;
    }
    
    await checkAuth();
    await loadBatchData();
    setupEventListeners();
    hideLoading();
});

// ============================================
// AUTHENTICATION
// ============================================
async function checkAuth() {
    try {
        const { data: { session } } = await sb.auth.getSession();
        
        if (!session) {
            // Redirect to login with return URL
            window.location.href = `login.html?redirect=book.html?batch=${batchId}`;
            return;
        }
        
        currentUser = session.user;
        
        // Pre-fill user data if available
        if (currentUser.user_metadata?.full_name) {
            document.getElementById('fullName').value = currentUser.user_metadata.full_name;
        }
        
        if (currentUser.email) {
            document.getElementById('email').value = currentUser.email;
        }
        
    } catch (error) {
        console.error('Auth error:', error);
    }
}

// ============================================
// LOAD BATCH DATA
// ============================================
async function loadBatchData() {
    try {
        const { data: batch, error } = await sb
            .from('poultry_batches')
            .select(`
                *,
                supplier:poultry_suppliers (*)
            `)
            .eq('id', batchId)
            .single();
        
        if (error) throw error;
        if (!batch) throw new Error('Batch not found');
        
        currentBatch = batch;
        minOrder = batch.min_order || 1;
        maxOrder = batch.max_order || batch.available_quantity || 999;
        pricePerBird = batch.price_per_bird;
        quantity = minOrder;
        
        // Update UI
        updateBatchSummary();
        updatePickupInfo();
        
    } catch (error) {
        console.error('Error loading batch:', error);
        showToast('Failed to load batch details', 'error');
        setTimeout(() => {
            window.location.href = 'poultry-listings.html';
        }, 2000);
    }
}

function updateBatchSummary() {
    const container = document.getElementById('batchSummary');
    const pickupContainer = document.getElementById('pickupInfo');
    
    if (!currentBatch) return;
    
    const imageUrl = currentBatch.images?.[0] || 'https://placehold.co/400/0B4F6C/white?text=Poultry';
    
    container.innerHTML = `
        <div class="batch-card">
            <div class="batch-image">
                <img src="${imageUrl}" alt="${currentBatch.title}">
            </div>
            <div class="batch-info">
                <h4>${currentBatch.title || `${currentBatch.bird_type} Batch`}</h4>
                <div class="batch-meta">
                    <span><i class="fas fa-clock"></i> ${currentBatch.age_weeks} weeks</span>
                    <span><i class="fas fa-weight-hanging"></i> ${currentBatch.avg_weight_kg} kg</span>
                </div>
                <div class="batch-price">
                    UGX ${formatNumber(currentBatch.price_per_bird)} <small>per bird</small>
                </div>
            </div>
        </div>
        
        <div class="quantity-selector">
            <span class="quantity-label">Quantity:</span>
            <div class="quantity-controls">
                <button class="quantity-btn" onclick="decreaseQuantity()" id="decreaseBtn">−</button>
                <span class="quantity-value" id="quantity">${quantity}</span>
                <button class="quantity-btn" onclick="increaseQuantity()" id="increaseBtn">+</button>
            </div>
            <span class="quantity-limit">Max: ${maxOrder}</span>
        </div>
        
        <div class="total-section">
            <span>Total Amount:</span>
            <span class="total-amount" id="totalAmount">UGX ${formatNumber(quantity * pricePerBird)}</span>
        </div>
    `;
    
    // Update payment amounts
    document.getElementById('mobileAmount').textContent = formatNumber(quantity * pricePerBird);
    document.getElementById('cardAmount').textContent = formatNumber(quantity * pricePerBird);
    
    // Update supplier name in confirmation
    document.getElementById('supplierName').textContent = currentBatch.supplier.company_name;
}

function updatePickupInfo() {
    const container = document.getElementById('pickupInfo');
    
    container.innerHTML = `
        <div class="info-row">
            <span class="info-label">Location:</span>
            <span class="info-value">${currentBatch.pickup_location || 'To be advised'}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Distribution Date:</span>
            <span class="info-value">${formatDate(currentBatch.distribution_date)}</span>
        </div>
        ${currentBatch.pickup_instructions ? `
        <div class="info-row">
            <span class="info-label">Instructions:</span>
            <span class="info-value">${currentBatch.pickup_instructions}</span>
        </div>
        ` : ''}
    `;
}

// ============================================
// QUANTITY CONTROLS
// ============================================
function increaseQuantity() {
    if (quantity < maxOrder) {
        quantity++;
        updateQuantity();
    }
}

function decreaseQuantity() {
    if (quantity > minOrder) {
        quantity--;
        updateQuantity();
    }
}

function updateQuantity() {
    document.getElementById('quantity').textContent = quantity;
    document.getElementById('totalAmount').textContent = `UGX ${formatNumber(quantity * pricePerBird)}`;
    
    // Update payment amounts
    document.getElementById('mobileAmount').textContent = formatNumber(quantity * pricePerBird);
    document.getElementById('cardAmount').textContent = formatNumber(quantity * pricePerBird);
    
    // Enable/disable buttons
    document.getElementById('decreaseBtn').disabled = quantity <= minOrder;
    document.getElementById('increaseBtn').disabled = quantity >= maxOrder;
}

// ============================================
// CREATE BOOKING
// ============================================
async function createBooking() {
    // Validate form
    const fullName = document.getElementById('fullName').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const email = document.getElementById('email').value.trim();
    const whatsapp = document.getElementById('whatsapp').value.trim() || phone;
    const instructions = document.getElementById('instructions').value.trim();
    
    if (!fullName) {
        showToast('Please enter your full name', 'warning');
        document.getElementById('fullName').focus();
        return;
    }
    
    if (!phone) {
        showToast('Please enter your phone number', 'warning');
        document.getElementById('phone').focus();
        return;
    }
    
    // Validate phone format (simple Ugandan format)
    const phoneRegex = /^(\+256|0)[0-9]{9}$/;
    if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
        showToast('Please enter a valid Ugandan phone number', 'warning');
        document.getElementById('phone').focus();
        return;
    }
    
    showLoading();
    
    try {
        // Generate booking number
        const bookingNumber = generateBookingNumber();
        
        // Create booking in database
        const { data: booking, error } = await sb
            .from('poultry_bookings')
            .insert({
                booking_number: bookingNumber,
                buyer_id: currentUser.id,
                buyer_name: fullName,
                buyer_phone: phone,
                buyer_email: email || null,
                buyer_whatsapp: whatsapp,
                batch_id: parseInt(batchId),
                supplier_id: currentBatch.supplier.id,
                quantity: quantity,
                unit_price: pricePerBird,
                total_amount: quantity * pricePerBird,
                special_instructions: instructions,
                payment_status: 'pending',
                booking_status: 'confirmed',
                pickup_date: currentBatch.distribution_date,
                created_at: new Date().toISOString()
            })
            .select()
            .single();
        
        if (error) throw error;
        
        currentBooking = booking;
        
        // Update confirmation section
        document.getElementById('bookingNumber').textContent = bookingNumber;
        document.getElementById('confirmBatchTitle').textContent = currentBatch.title || 'Poultry Batch';
        document.getElementById('confirmQuantity').textContent = `${quantity} birds`;
        document.getElementById('confirmAmount').textContent = `UGX ${formatNumber(quantity * pricePerBird)}`;
        
        // Hide review section, show confirmation
        document.getElementById('reviewSection').style.display = 'none';
        document.getElementById('confirmationSection').style.display = 'block';
        
        // Update progress bar
        document.querySelectorAll('.progress-step')[1].classList.add('completed');
        document.getElementById('step3').classList.add('active');
        
        // Send notification to supplier (via WhatsApp/email)
        await notifySupplier();
        
        showToast('Booking sent to seller!', 'success');
        
    } catch (error) {
        console.error('Error creating booking:', error);
        showToast('Failed to create booking', 'error');
    } finally {
        hideLoading();
    }
}

function generateBookingNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `BOK-${year}${month}${day}-${random}`;
}

async function notifySupplier() {
    // This would send a notification to the supplier
    // For now, we'll just log it
    console.log('Notification sent to supplier:', currentBatch.supplier.company_name);
}

// ============================================
// PAYMENT FLOW
// ============================================
function proceedToPayment() {
    document.getElementById('confirmationSection').style.display = 'none';
    document.getElementById('paymentSection').style.display = 'block';
    
    // Update payment summary
    document.getElementById('paymentBookingNumber').textContent = currentBooking.booking_number;
    document.getElementById('paymentAmount').textContent = `UGX ${formatNumber(currentBooking.total_amount)}`;
}

function selectPaymentMethod(method) {
    // Update tabs
    document.querySelectorAll('.method-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.closest('.method-tab').classList.add('active');
    
    // Show corresponding form
    document.querySelectorAll('.payment-form').forEach(form => {
        form.classList.remove('active');
    });
    document.getElementById(`${method}MoneyForm` || `${method}Form`).classList.add('active');
}

async function processPayment(method) {
    if (!currentBooking) {
        showToast('No active booking found', 'error');
        return;
    }
    
    // Validate based on method
    if (method === 'mobile') {
        const network = document.getElementById('mobileNetwork').value;
        const mobileNumber = document.getElementById('mobileNumber').value.trim();
        const pin = document.getElementById('mobilePin').value.trim();
        
        if (!network || !mobileNumber || !pin) {
            showToast('Please fill in all mobile money details', 'warning');
            return;
        }
    } else if (method === 'card') {
        const cardNumber = document.getElementById('cardNumber').value.trim();
        const expiry = document.getElementById('expiry').value.trim();
        const cvv = document.getElementById('cvv').value.trim();
        const cardName = document.getElementById('cardName').value.trim();
        
        if (!cardNumber || !expiry || !cvv || !cardName) {
            showToast('Please fill in all card details', 'warning');
            return;
        }
    }
    
    // Check terms
    if (!document.getElementById('acceptTerms').checked) {
        showToast('Please accept the terms and conditions', 'warning');
        return;
    }
    
    showLoading();
    
    try {
        // In production, integrate with actual payment gateway
        // For now, simulate successful payment after 2 seconds
        setTimeout(async () => {
            // Update booking payment status
            const { error } = await sb
                .from('poultry_bookings')
                .update({
                    payment_status: 'paid',
                    payment_method: method,
                    paid_at: new Date().toISOString()
                })
                .eq('id', currentBooking.id);
            
            if (error) throw error;
            
            // Update batch stock
            await sb
                .from('poultry_batches')
                .update({
                    available_quantity: currentBatch.available_quantity - quantity,
                    booked_quantity: currentBatch.booked_quantity + quantity
                })
                .eq('id', batchId);
            
            hideLoading();
            
            // Show success modal
            document.getElementById('successModal').classList.add('show');
            
        }, 2000);
        
    } catch (error) {
        console.error('Payment error:', error);
        showToast('Payment failed. Please try again.', 'error');
        hideLoading();
    }
}

function submitBankProof() {
    const file = document.getElementById('proofUpload').files[0];
    const transactionRef = document.getElementById('transactionRef').value.trim();
    
    if (!file) {
        showToast('Please upload payment proof', 'warning');
        return;
    }
    
    // In production, upload file to storage
    showToast('Proof submitted! Seller will verify payment.', 'success');
    
    // Update booking with pending verification
    setTimeout(() => {
        document.getElementById('successModal').classList.add('show');
    }, 1500);
}

// ============================================
// FILE UPLOAD HANDLING
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('proofUpload');
    
    if (uploadArea && fileInput) {
        uploadArea.addEventListener('click', () => {
            fileInput.click();
        });
        
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = 'var(--primary)';
            uploadArea.style.background = 'var(--light)';
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.style.borderColor = 'var(--gray-light)';
            uploadArea.style.background = 'white';
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = 'var(--gray-light)';
            uploadArea.style.background = 'white';
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                fileInput.files = files;
                showToast(`Selected: ${files[0].name}`, 'success');
            }
        });
        
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) {
                showToast(`Selected: ${fileInput.files[0].name}`, 'success');
            }
        });
    }
});

// ============================================
// NAVIGATION
// ============================================
function goBack() {
    if (document.getElementById('paymentSection').style.display === 'block') {
        // Go back to confirmation
        document.getElementById('paymentSection').style.display = 'none';
        document.getElementById('confirmationSection').style.display = 'block';
    } else if (document.getElementById('confirmationSection').style.display === 'block') {
        // Go back to review
        document.getElementById('confirmationSection').style.display = 'none';
        document.getElementById('reviewSection').style.display = 'block';
        
        // Update progress bar
        document.querySelectorAll('.progress-step')[1].classList.remove('completed');
        document.getElementById('step3').classList.remove('active');
    } else {
        // Go back to listings
        window.location.href = `poultry-listing.html?id=${batchId}`;
    }
}

function trackBooking() {
    window.location.href = `track-booking.html?booking=${currentBooking?.booking_number}`;
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Form submission (step 1)
    const form = document.querySelector('#reviewSection');
    const submitBtn = document.createElement('button');
    submitBtn.style.display = 'none';
    form.appendChild(submitBtn);
    
    // Listen for Enter key
    document.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            if (document.getElementById('reviewSection').style.display !== 'none') {
                createBooking();
            }
        }
    });
    
    // Card number formatting
    const cardNumber = document.getElementById('cardNumber');
    if (cardNumber) {
        cardNumber.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\s/g, '').replace(/\D/g, '');
            let formatted = '';
            for (let i = 0; i < value.length; i++) {
                if (i > 0 && i % 4 === 0) formatted += ' ';
                formatted += value[i];
            }
            e.target.value = formatted;
        });
    }
    
    // Expiry formatting
    const expiry = document.getElementById('expiry');
    if (expiry) {
        expiry.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length >= 2) {
                e.target.value = value.substring(0, 2) + '/' + value.substring(2, 4);
            } else {
                e.target.value = value;
            }
        });
    }
    
    // CVV - numbers only
    const cvv = document.getElementById('cvv');
    if (cvv) {
        cvv.addEventListener('input', function(e) {
            e.target.value = e.target.value.replace(/\D/g, '');
        });
    }
    
    // Help button
    document.getElementById('helpBtn').addEventListener('click', function() {
        showToast('Contact support: support@ibluepoultry.ug', 'info');
    });
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function formatNumber(num) {
    return num?.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') || '0';
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-UG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function showLoading() {
    document.getElementById('loadingOverlay').classList.add('show');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('show');
}