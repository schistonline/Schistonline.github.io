// ============================================
// POULTRY LISTING PAGE - VERSION
// ================]============================

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
let currentUser = null;
let currentBatch = null;
let currentSupplier = null;
let swiper = null;
let countdownInterval = null;

// Get batch ID from URL
const urlParams = new URLSearchParams(window.location.search);
const batchId = urlParams.get('id');

// ============================================
// INITIALIZATION
//=============================================
document.addEventListener('DOMContentLoaded', async function() {
    if (!batchId) {
        window.location.href = 'poultry-listings.html';
        return;
    }
    
    showLoading();
    await checkAuth();
    await loadBatchData();
    initSwiper();
    initAOS();
    startCountdownTimer();
    setupEventListeners();
    hideLoading();
});

// ============================================
// AUTHENTICATION
// ==============================7==============
async function checkAuth() {
    try {
        const { data: { session } } = await sb.auth.getSession();
        
        if (session) {
            currentUser = session.user;
            
            // Update UI for logged in user
            document.getElementById('loginBtn').style.display = 'none';
            document.getElementById('registerBtn').style.display = 'none';
            document.getElementById('profileDropdown').style.display = 'block';
            
            // Load user profile
            await loadUserProfile();
        }
    } catch (error) {
        console.error('Auth check error:', error);
    }
}

async function loadUserProfile() {
    try {
        const { data: profile } = await sb
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();
        
        if (profile) {
            const profileImg = document.querySelector('#profileDropdown .profile-image');
            if (profile.avatar_url) {
                profileImg.src = profile.avatar_url;
            } else {
                profileImg.src = `https://ui-avatars.com/api/?name=${profile.full_name || 'User'}&background=0B4F6C&color=fff&size=40`;
            }
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

async function logout() {
    try {
        await sb.auth.signOut();
        window.location.reload();
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// ============================================
// LOAD BATCH DATA FROM SUPABASE
// ============================================
async function loadBatchData() {
    try {
        // Fetch batch with supplier data
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
        currentSupplier = batch.supplier;
        
        // Update UI
        updateUIWithBatchData();
        
        // Load related batches
        await loadRelatedBatches();
        
    } catch (error) {
        console.error('Error loading batch:', error);
        showToast('Failed to load batch details', 'error');
        setTimeout(() => {
            window.location.href = 'poultry-listings.html';
        }, 2000);
    }
}

function updateUIWithBatchData() {
    // Update breadcrumb
    document.getElementById('breadcrumbSupplier').textContent = currentSupplier.company_name;
    
    // Update marquee
    document.getElementById('marqueeText').innerHTML = 
        `<span>${currentSupplier.tagline || currentSupplier.company_name + ' - Premium Poultry Supplier'}</span>`;
    
    // Update supplier info
    document.getElementById('supplierName').textContent = currentSupplier.company_name;
    document.getElementById('supplierLocation').textContent = `${currentSupplier.district}, Uganda`;
    document.getElementById('supplierBio').innerHTML = `<p>${currentSupplier.description || 'No description available.'}</p>`;
    
    // Update supplier logo
    const logoImg = document.querySelector('#supplierLogo img');
    if (currentSupplier.company_logo) {
        logoImg.src = currentSupplier.company_logo;
    } else {
        logoImg.src = `https://ui-avatars.com/api/?name=${currentSupplier.company_name.replace(/ /g, '+')}&background=0B4F6C&color=fff&size=80`;
    }
    
    // Update verification badge
    if (currentSupplier.verified) {
        document.getElementById('verifiedBadge').style.display = 'inline';
    }
    
    // Update rating
    document.getElementById('ratingValue').textContent = (currentSupplier.avg_rating || 0).toFixed(1);
    document.getElementById('reviewCount').textContent = currentSupplier.review_count || 0;
    
    // Update batch title
    document.getElementById('batchTitle').textContent = currentBatch.title || `Batch #${currentBatch.batch_number}`;
    
    // Update status
    const statusEl = document.getElementById('batchStatus');
    statusEl.textContent = formatStatus(currentBatch.status);
    statusEl.className = `batch-status ${currentBatch.status}`;
    
    // Update stats
    document.getElementById('availableStock').textContent = currentBatch.available_quantity || 0;
    document.getElementById('bookedStock').textContent = currentBatch.booked_quantity || 0;
    document.getElementById('totalStock').textContent = currentBatch.total_quantity || 0;
    
    // Update price
    document.getElementById('pricePerBird').textContent = formatNumber(currentBatch.price_per_bird || 0);
    document.getElementById('minOrderNote').textContent = `per bird (min. ${currentBatch.min_order || 1})`;
    
    // Update distribution
    if (currentBatch.distribution_date) {
        document.getElementById('distributionDate').textContent = formatDate(currentBatch.distribution_date);
    }
    
    // Update bird details
    document.getElementById('birdAge').textContent = currentBatch.age_weeks ? 
        `${currentBatch.age_weeks} Week${currentBatch.age_weeks > 1 ? 's' : ''}` : '-';
    document.getElementById('birdBreed').textContent = currentBatch.breed || '-';
    document.getElementById('birdWeight').textContent = currentBatch.avg_weight_kg ? 
        `${currentBatch.avg_weight_kg} KG` : '-';
    document.getElementById('minOrder').textContent = currentBatch.min_order || '1';
    
    // Update vaccination tags
    const vaccineContainer = document.getElementById('vaccinationTags');
    if (currentBatch.vaccination_status && currentBatch.vaccination_status.length > 0) {
        vaccineContainer.innerHTML = currentBatch.vaccination_status.map(v => 
            `<span class="vaccine-tag">${v}</span>`
        ).join('');
        
        if (currentBatch.health_certified) {
            vaccineContainer.innerHTML += '<span class="vaccine-tag certified"><i class="fas fa-check-circle"></i> Certified</span>';
        }
    } else {
        vaccineContainer.innerHTML = '<span class="vaccine-tag">No vaccination data</span>';
    }
    
    // Update pickup location
    document.getElementById('pickupLocation').textContent = currentBatch.pickup_location || 'To be advised';
    if (currentBatch.pickup_instructions) {
        document.getElementById('pickupInstructions').textContent = currentBatch.pickup_instructions;
    }
    
    // Update supplier features
    const features = [
        { icon: 'fa-truck', text: `${currentSupplier.district} delivery` },
        { icon: 'fa-shield-alt', text: currentBatch.health_certified ? 'Health certified' : 'Quality assured' },
        { icon: 'fa-clock', text: 'On-time distribution' },
        { icon: 'fa-hand-holding-heart', text: 'Support available' }
    ];
    
    document.getElementById('supplierFeatures').innerHTML = features.map(f =>
        `<div class="feature"><i class="fas ${f.icon}"></i><span>${f.text}</span></div>`
    ).join('');
    
    // Update view all link
    document.getElementById('viewAllLink').href = `supplier-batches.html?id=${currentSupplier.id}`;
    
    // Update carousel images
    updateCarouselImages();
    
    // Update WhatsApp and call buttons
    document.getElementById('whatsappBtn').setAttribute('data-phone', currentSupplier.whatsapp_number || currentSupplier.phone);
    document.getElementById('callBtn').setAttribute('data-phone', currentSupplier.phone);
}

function updateCarouselImages() {
    const carouselWrapper = document.querySelector('#carouselImages');
    const thumbnailWrapper = document.querySelector('#thumbnailImages');
    
    if (currentBatch.images && currentBatch.images.length > 0) {
        carouselWrapper.innerHTML = currentBatch.images.map(img => `
            <div class="swiper-slide">
                <img src="${img}" alt="${currentBatch.title}" loading="lazy">
            </div>
        `).join('');
        
        thumbnailWrapper.innerHTML = currentBatch.images.map(img => `
            <div class="swiper-slide">
                <img src="${img}" alt="Thumbnail" loading="lazy">
            </div>
        `).join('');
    }
}

// ============================================
// LOAD RELATED BATCHES
// ============================================
async function loadRelatedBatches() {
    try {
        const { data: batches, error } = await sb
            .from('poultry_batches')
            .select('id, title, images, age_weeks, price_per_bird, available_quantity, bird_type')
            .eq('supplier_id', currentSupplier.id)
            .neq('id', batchId)
            .eq('status', 'available')
            .limit(4);
        
        if (error) throw error;
        
        const container = document.getElementById('relatedBatches');
        
        if (!batches || batches.length === 0) {
            container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 20px;">No other batches available</p>';
            return;
        }
        
        container.innerHTML = batches.map(batch => `
            <a href="poultry-listing.html?id=${batch.id}" class="related-card">
                <img src="${batch.images?.[0] || 'https://placehold.co/400/0B4F6C/white?text=Batch'}" 
                     alt="${batch.title}" loading="lazy">
                <div class="related-info">
                    <h4>${batch.title || `${batch.bird_type} Batch`}</h4>
                    <div class="meta">${batch.age_weeks || '?'} weeks</div>
                    <div class="price">UGX ${formatNumber(batch.price_per_bird)}</div>
                    <div class="stock">${batch.available_quantity || 0} available</div>
                </div>
            </a>
        `).join('');
        
    } catch (error) {
        console.error('Error loading related batches:', error);
    }
}

// ============================================
// CAROUSEL INITIALIZATION
// ============================================
function initSwiper() {
    if (swiper) swiper.destroy();
    
    swiper = new Swiper('.mainSwiper', {
        loop: true,
        spaceBetween: 10,
        navigation: {
            nextEl: '.swiper-button-next',
            prevEl: '.swiper-button-prev',
        },
        pagination: {
            el: '.swiper-pagination',
            clickable: true,
        },
        thumbs: {
            swiper: {
                el: '.thumbnail-swiper',
                slidesPerView: 4,
                spaceBetween: 10,
            },
        },
        autoplay: {
            delay: 5000,
            disableOnInteraction: false,
        },
    });
}

// ============================================
// COUNTDOWN TIMER
// ============================================
function startCountdownTimer() {
    if (!currentBatch?.distribution_date) return;
    
    const distributionDate = new Date(currentBatch.distribution_date).getTime();
    
    function updateTimer() {
        const now = new Date().getTime();
        const distance = distributionDate - now;
        
        if (distance < 0) {
            document.getElementById('timerDays').textContent = '00';
            document.getElementById('timerHours').textContent = '00';
            document.getElementById('timerMinutes').textContent = '00';
            document.getElementById('timerSeconds').textContent = '00';
            
            if (countdownInterval) clearInterval(countdownInterval);
            return;
        }
        
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        
        document.getElementById('timerDays').textContent = days.toString().padStart(2, '0');
        document.getElementById('timerHours').textContent = hours.toString().padStart(2, '0');
        document.getElementById('timerMinutes').textContent = minutes.toString().padStart(2, '0');
        document.getElementById('timerSeconds').textContent = seconds.toString().padStart(2, '0');
    }
    
    updateTimer();
    countdownInterval = setInterval(updateTimer, 1000);
}

// ============================================
// ANIMATION INITIALIZATION
// ============================================
function initAOS() {
    AOS.init({
        duration: 600,
        once: true,
        offset: 50,
        disable: window.innerWidth < 768
    });
}

// ============================================
// INQUIRY MODAL
// ============================================
function openInquiryModal() {
    if (!currentUser) {
        showToast('Please login to send an inquiry', 'warning');
        setTimeout(() => {
            window.location.href = `login.html?redirect=poultry-listing.html?id=${batchId}`;
        }, 1500);
        return;
    }
    
    // Pre-fill user data
    document.getElementById('inquirerName').value = currentUser.user_metadata?.full_name || '';
    document.getElementById('inquirerEmail').value = currentUser.email || '';
    
    document.getElementById('inquiryModal').classList.add('show');
}

function closeInquiryModal() {
    document.getElementById('inquiryModal').classList.remove('show');
    document.getElementById('inquiryForm').reset();
}

async function sendWhatsAppInquiry() {
    const name = document.getElementById('inquirerName').value.trim();
    const phone = document.getElementById('inquirerPhone').value.trim();
    const email = document.getElementById('inquirerEmail').value.trim();
    const quantity = document.getElementById('inquiryQuantity').value;
    const message = document.getElementById('inquiryMessage').value.trim();
    const preferredDate = document.getElementById('preferredPickupDate').value;
    
    if (!name || !phone || !quantity || !message) {
        showToast('Please fill in all required fields', 'warning');
        return;
    }
    
    const sendBtn = document.getElementById('sendInquiryBtn');
    const originalText = sendBtn.innerHTML;
    sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    sendBtn.disabled = true;
    
    try {
        // Format WhatsApp message
        const whatsappMessage = `
*New Poultry Inquiry*
---------------------
*From:* ${name}
*Phone:* ${phone}
*Email:* ${email || 'Not provided'}
*Batch:* ${currentBatch.title || `Batch #${currentBatch.batch_number}`}
*Quantity:* ${quantity} birds
*Pickup Date:* ${preferredDate ? formatDate(preferredDate) : 'Not specified'}

*Message:*
${message}

---------------------
Sent via iBlue Poultry App
        `.trim();
        
        // Save inquiry to database
        await sb.from('poultry_inquiries').insert({
            batch_id: batchId,
            supplier_id: currentSupplier.id,
            inquirer_name: name,
            inquirer_phone: phone,
            inquirer_email: email || null,
            quantity_interest: quantity,
            message: message,
            preferred_pickup_date: preferredDate || null
        });
        
        // Open WhatsApp
        const whatsappNumber = currentSupplier.whatsapp_number || currentSupplier.phone;
        const cleanNumber = whatsappNumber.replace(/[^0-9]/g, '');
        window.open(`https://wa.me/${cleanNumber}?text=${encodeURIComponent(whatsappMessage)}`, '_blank');
        
        showToast('Inquiry sent via WhatsApp!', 'success');
        closeInquiryModal();
        
    } catch (error) {
        console.error('Error sending inquiry:', error);
        showToast('Failed to send inquiry', 'error');
    } finally {
        sendBtn.innerHTML = originalText;
        sendBtn.disabled = false;
    }
}

// ============================================
// BOOK NOW
// ============================================
function redirectToBooking() {
    if (!currentUser) {
        showToast('Please login to book', 'warning');
        setTimeout(() => {
            window.location.href = `login.html?redirect=book.html?batch=${batchId}`;
        }, 1500);
        return;
    }
    
    window.location.href = `book.html?batch=${batchId}`;
}

// ============================================
// CONTACT FUNCTIONS
// ============================================
function openWhatsApp() {
    const number = currentSupplier.whatsapp_number || currentSupplier.phone;
    const cleanNumber = number.replace(/[^0-9]/g, '');
    const message = encodeURIComponent(`Hello ${currentSupplier.company_name}, I'm interested in your poultry batch.`);
    window.open(`https://wa.me/${cleanNumber}?text=${message}`, '_blank');
}

function callSupplier() {
    window.location.href = `tel:${currentSupplier.phone}`;
}

// ============================================
// SEARCH OVERLAY
// ============================================
document.getElementById('searchBtn')?.addEventListener('click', function() {
    document.getElementById('searchOverlay').classList.add('show');
});

function closeSearch() {
    document.getElementById('searchOverlay').classList.remove('show');
}

// ============================================
// MOBILE MENU
// ============================================
document.getElementById('mobileMenuBtn')?.addEventListener('click', function() {
    document.getElementById('navMenu').classList.toggle('show');
});

// Close mobile menu when clicking outside
document.addEventListener('click', function(event) {
    const navMenu = document.getElementById('navMenu');
    const mobileBtn = document.getElementById('mobileMenuBtn');
    
    if (!navMenu || !mobileBtn) return;
    
    if (!navMenu.contains(event.target) && !mobileBtn.contains(event.target)) {
        navMenu.classList.remove('show');
    }
});

// ============================================
// PROFILE DROPDOWN
// ============================================
document.getElementById('profileDropdown')?.addEventListener('click', function(e) {
    e.stopPropagation();
    document.getElementById('dropdownMenu').classList.toggle('show');
});

document.addEventListener('click', function() {
    document.getElementById('dropdownMenu')?.classList.remove('show');
});

// ============================================
// GLOBAL SEARCH
// ============================================
document.getElementById('globalSearch')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        const query = this.value.trim();
        if (query) {
            window.location.href = `search.html?q=${encodeURIComponent(query)}`;
        }
    }
});

// ============================================
// UTILITY FUNCTIONS
// ============================================
function formatNumber(num) {
    return num?.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') || '0';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-UG', {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric'
    });
}

function formatStatus(status) {
    if (!status) return 'Unknown';
    return status.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
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

function setupEventListeners() {
    // Handle window resize for AOS
    window.addEventListener('resize', function() {
        if (window.innerWidth < 768) {
            AOS.init({ disable: true });
        } else {
            AOS.init({ disable: false });
        }
    });
}

// ============================================
// REAL-TIME UPDATES
// ============================================
function subscribeToUpdates() {
    const channel = sb
        .channel('batch-updates')
        .on(
            'postgres_changes',
            { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'poultry_batches',
                filter: `id=eq.${batchId}`
            },
            (payload) => {
                // Update stock in real-time
                document.getElementById('availableStock').textContent = payload.new.available_quantity;
                document.getElementById('bookedStock').textContent = payload.new.booked_quantity;
                showToast('Stock updated!', 'info');
            }
        )
        .subscribe();
}

// Uncomment for real-time updates
// subscribeToUpdates();

// Cleanup
window.addEventListener('beforeunload', function() {
    if (countdownInterval) clearInterval(countdownInterval);
});