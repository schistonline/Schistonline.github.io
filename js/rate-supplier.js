// ============================================
// RATE SUPPLIER PAGE - FIXED VERSION
// ============================================

console.log('🚀 Rate supplier page loading...');

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
let supplierId = null;
let supplier = null;
let currentUser = null;
let uploadedPhotos = [];

// Rating values
let ratings = {
    overall: 0,
    quality: 0,
    communication: 0,
    delivery: 0
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Initializing rate supplier page...');
    
    // Get supplier ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    supplierId = urlParams.get('id');
    
    if (!supplierId) {
        showError('No supplier specified');
        return;
    }
    
    console.log('Supplier ID:', supplierId);
    
    // Check if user is logged in
    const { data: { user }, error: authError } = await sb.auth.getUser();
    
    if (authError || !user) {
        console.log('User not logged in, redirecting...');
        window.location.href = `login.html?redirect=rate-supplier.html?id=${supplierId}`;
        return;
    }
    
    currentUser = user;
    console.log('User logged in:', currentUser.id);
    
    await loadSupplier();
    await loadRecentReviews();
    setupEventListeners();
});

// ============================================
// LOAD SUPPLIER
// ============================================
async function loadSupplier() {
    try {
        const { data, error } = await sb
            .from('suppliers')
            .select(`
                *,
                profiles!suppliers_profile_id_fkey (
                    avatar_url,
                    full_name
                )
            `)
            .eq('id', supplierId)
            .single();

        if (error) throw error;
        
        supplier = data;
        console.log('Supplier loaded:', supplier.business_name);
        renderSupplierInfo();
        
    } catch (error) {
        console.error('Error loading supplier:', error);
        showError('Failed to load supplier');
    }
}

function renderSupplierInfo() {
    const avatarContainer = document.getElementById('supplierAvatar');
    const nameElement = document.getElementById('supplierName');
    const metaElement = document.getElementById('supplierMeta');
    
    if (avatarContainer) {
        avatarContainer.innerHTML = supplier.profiles?.avatar_url ? 
            `<img src="${supplier.profiles.avatar_url}" alt="${supplier.business_name}" style="width:100%;height:100%;object-fit:cover;">` : 
            '<i class="fas fa-store"></i>';
    }
    
    if (nameElement) {
        nameElement.textContent = supplier.business_name;
    }
    
    if (metaElement) {
        const verified = supplier.verification_status === 'verified';
        const avgRating = supplier.avg_rating || 0;
        const reviewCount = supplier.review_count || 0;
        
        metaElement.innerHTML = `
            <span><i class="fas ${verified ? 'fa-check-circle' : 'fa-clock'}"></i> ${verified ? 'Verified Supplier' : 'Pending Verification'}</span>
            <span><i class="fas fa-star"></i> ${avgRating.toFixed(1)} ★ (${reviewCount} reviews)</span>
        `;
    }
}

// ============================================
// LOAD RECENT REVIEWS
// ============================================
async function loadRecentReviews() {
    try {
        const { data, error } = await sb
            .from('reviews')
            .select(`
                *,
                profiles:reviewer_id (full_name, avatar_url)
            `)
            .eq('reviewee_id', supplierId)
            .eq('review_type', 'supplier')
            .order('created_at', { ascending: false })
            .limit(5);
        
        if (error) throw error;
        
        console.log('Reviews loaded:', data?.length || 0);
        renderReviews(data || []);
        
        // Update review count
        const countElement = document.getElementById('reviewsCount');
        if (countElement && data) {
            countElement.textContent = `(${data.length})`;
        }
        
    } catch (error) {
        console.error('Error loading reviews:', error);
        const container = document.getElementById('reviewsList');
        if (container) {
            container.innerHTML = '<div class="empty-reviews"><i class="fas fa-exclamation-circle"></i><p>Failed to load reviews</p></div>';
        }
    }
}

function renderReviews(reviews) {
    const container = document.getElementById('reviewsList');
    if (!container) return;
    
    if (!reviews || reviews.length === 0) {
        container.innerHTML = `
            <div class="empty-reviews">
                <i class="fas fa-comment-dots"></i>
                <p>No reviews yet. Be the first to review this supplier!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = reviews.map(review => {
        const isAnonymous = review.is_anonymous;
        const reviewerName = isAnonymous ? 'Anonymous Buyer' : (review.profiles?.full_name || 'User');
        const reviewerInitial = reviewerName.charAt(0).toUpperCase();
        const date = new Date(review.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
        
        let quality = review.quality_rating || 0;
        let communication = review.communication_rating || 0;
        let delivery = review.delivery_rating || 0;
        
        return `
            <div class="review-card">
                <div class="review-header">
                    <div class="reviewer-info">
                        <div class="reviewer-avatar">${reviewerInitial}</div>
                        <div>
                            <div class="reviewer-name">${escapeHtml(reviewerName)}</div>
                            <div class="review-date">${date}</div>
                        </div>
                    </div>
                    <div class="review-stars">
                        ${renderStars(review.rating)}
                    </div>
                </div>
                ${review.title ? `<div class="review-title">${escapeHtml(review.title)}</div>` : ''}
                <div class="review-text">${escapeHtml(review.comment || '')}</div>
                <div class="review-categories">
                    ${quality > 0 ? `<span class="category-score">Quality: <strong>${quality}★</strong></span>` : ''}
                    ${communication > 0 ? `<span class="category-score">Communication: <strong>${communication}★</strong></span>` : ''}
                    ${delivery > 0 ? `<span class="category-score">Delivery: <strong>${delivery}★</strong></span>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function renderStars(rating) {
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= rating) {
            stars += '<i class="fas fa-star"></i>';
        } else {
            stars += '<i class="far fa-star"></i>';
        }
    }
    return stars;
}

// ============================================
// RATING SYSTEM
// ============================================
function setupRatingStars() {
    const ratingElements = ['overallRating', 'qualityRating', 'communicationRating', 'deliveryRating'];
    
    ratingElements.forEach(elementId => {
        const container = document.getElementById(elementId);
        if (!container) return;
        
        const stars = container.querySelectorAll('i');
        stars.forEach(star => {
            star.addEventListener('click', () => {
                const rating = parseInt(star.getAttribute('data-rating'));
                const category = elementId.replace('Rating', '');
                ratings[category] = rating;
                
                // Update UI
                updateStarUI(container, rating);
                
                // Update hint
                const hintElement = document.getElementById(`${category}Hint`);
                if (hintElement) {
                    const hints = {
                        overall: ['Poor', 'Fair', 'Good', 'Very Good', 'Excellent'],
                        quality: ['Poor quality', 'Below average', 'Good quality', 'Very good', 'Excellent quality'],
                        communication: ['No response', 'Slow response', 'Good', 'Very responsive', 'Excellent'],
                        delivery: ['Very late', 'Late', 'On time', 'Early', 'Very early']
                    };
                    hintElement.textContent = hints[category]?.[rating - 1] || 'Selected';
                    hintElement.style.color = getRatingColor(rating);
                }
                
                validateForm();
            });
        });
    });
}

function updateStarUI(container, rating) {
    const stars = container.querySelectorAll('i');
    stars.forEach((star, index) => {
        const starRating = parseInt(star.getAttribute('data-rating'));
        if (starRating <= rating) {
            star.classList.remove('far');
            star.classList.add('fas');
            star.classList.add('active');
        } else {
            star.classList.remove('fas');
            star.classList.add('far');
            star.classList.remove('active');
        }
    });
}

function getRatingColor(rating) {
    if (rating >= 4) return '#10B981';
    if (rating >= 3) return '#F59E0B';
    return '#EF4444';
}

// ============================================
// PHOTO UPLOAD
// ============================================
function setupPhotoUpload() {
    const uploadArea = document.getElementById('photoUploadArea');
    const fileInput = document.getElementById('photoUpload');
    
    if (!uploadArea || !fileInput) return;
    
    uploadArea.addEventListener('click', () => {
        fileInput.click();
    });
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--primary)';
        uploadArea.style.background = 'var(--gray-50)';
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = 'var(--gray-300)';
        uploadArea.style.background = 'var(--gray-100)';
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--gray-300)';
        uploadArea.style.background = 'var(--gray-100)';
        
        const files = Array.from(e.dataTransfer.files);
        handlePhotoFiles(files);
    });
    
    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        handlePhotoFiles(files);
    });
}

function handlePhotoFiles(files) {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    
    if (uploadedPhotos.length + imageFiles.length > 5) {
        showToast('Maximum 5 photos allowed', 'error');
        return;
    }
    
    imageFiles.forEach(file => {
        if (file.size > 5 * 1024 * 1024) {
            showToast('Photo size should be less than 5MB', 'error');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            uploadedPhotos.push({
                file: file,
                preview: e.target.result,
                id: Date.now() + Math.random()
            });
            renderPhotoPreviews();
        };
        reader.readAsDataURL(file);
    });
}

function renderPhotoPreviews() {
    const container = document.getElementById('photoPreview');
    if (!container) return;
    
    if (uploadedPhotos.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = uploadedPhotos.map(photo => `
        <div class="preview-image">
            <img src="${photo.preview}" alt="Preview">
            <div class="remove-photo" data-id="${photo.id}">
                <i class="fas fa-times"></i>
            </div>
        </div>
    `).join('');
    
    // Add remove event listeners
    document.querySelectorAll('.remove-photo').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = btn.getAttribute('data-id');
            uploadedPhotos = uploadedPhotos.filter(p => p.id != id);
            renderPhotoPreviews();
        });
    });
}

// ============================================
// FORM VALIDATION
// ============================================
function validateForm() {
    let isValid = true;
    
    // Check all ratings
    if (ratings.overall === 0) isValid = false;
    if (ratings.quality === 0) isValid = false;
    if (ratings.communication === 0) isValid = false;
    if (ratings.delivery === 0) isValid = false;
    
    // Check review text
    const reviewText = document.getElementById('reviewText')?.value.trim();
    if (!reviewText) isValid = false;
    
    // Check terms
    const termsAgree = document.getElementById('termsAgree')?.checked;
    if (!termsAgree) isValid = false;
    
    const submitBtn = document.getElementById('submitRatingBtn');
    if (submitBtn) {
        submitBtn.disabled = !isValid;
    }
    
    return isValid;
}

// ============================================
// SUBMIT REVIEW
// ============================================
async function submitReview() {
    if (!validateForm()) {
        showToast('Please complete all required fields', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const reviewTitle = document.getElementById('reviewTitle')?.value.trim();
        const reviewText = document.getElementById('reviewText')?.value.trim();
        const orderReference = document.getElementById('orderReference')?.value.trim();
        const isAnonymous = document.getElementById('anonymousReview')?.checked || false;
        
        // Upload photos if any (in production, upload to Supabase Storage)
        let photoUrls = [];
        for (const photo of uploadedPhotos) {
            photoUrls.push(photo.preview);
        }
        
        console.log('Submitting review with data:', {
            reviewer_id: currentUser.id,
            reviewee_id: supplierId,
            review_type: 'supplier',
            rating: ratings.overall,
            quality_rating: ratings.quality,
            communication_rating: ratings.communication,
            delivery_rating: ratings.delivery,
            title: reviewTitle,
            comment: reviewText,
            is_anonymous: isAnonymous,
            is_verified_purchase: !!orderReference,
            order_reference: orderReference,
            photo_urls: photoUrls,
            is_public: true
        });
        
        // Insert review - using correct column names
        const { data, error } = await sb
            .from('reviews')
            .insert({
                reviewer_id: currentUser.id,
                reviewee_id: supplierId,
                review_type: 'supplier',
                rating: ratings.overall,
                quality_rating: ratings.quality,
                communication_rating: ratings.communication,
                delivery_rating: ratings.delivery,
                title: reviewTitle,
                comment: reviewText,
                is_anonymous: isAnonymous,
                is_verified_purchase: !!orderReference,
                order_reference: orderReference,
                photo_urls: photoUrls,
                is_public: true
            })
            .select()
            .single();
        
        if (error) {
            console.error('Insert error:', error);
            throw error;
        }
        
        console.log('Review submitted successfully:', data);
        
        // Update supplier average rating
        await updateSupplierRating();
        
        // Show success modal
        showSuccessModal();
        
        // Reset form
        resetForm();
        
        // Reload reviews
        await loadRecentReviews();
        
    } catch (error) {
        console.error('Error submitting review:', error);
        let errorMessage = 'Failed to submit review. ';
        
        if (error.message) {
            errorMessage += error.message;
        } else if (error.code === 'PGRST204') {
            errorMessage += 'Database schema issue. Please contact support.';
        } else {
            errorMessage += 'Please try again.';
        }
        
        showToast(errorMessage, 'error');
    }
    
    showLoading(false);
}

async function updateSupplierRating() {
    try {
        // Get all reviews for this supplier
        const { data: reviews, error } = await sb
            .from('reviews')
            .select('rating')
            .eq('reviewee_id', supplierId)
            .eq('review_type', 'supplier')
            .eq('is_public', true);
        
        if (error) throw error;
        
        if (reviews && reviews.length > 0) {
            const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
            const avgRating = totalRating / reviews.length;
            
            // Update supplier
            await sb
                .from('suppliers')
                .update({
                    avg_rating: avgRating,
                    review_count: reviews.length
                })
                .eq('id', supplierId);
            
            console.log('Supplier rating updated:', avgRating);
        }
        
    } catch (error) {
        console.error('Error updating supplier rating:', error);
    }
}

function resetForm() {
    // Reset ratings
    ratings = {
        overall: 0,
        quality: 0,
        communication: 0,
        delivery: 0
    };
    
    // Reset star UIs
    const ratingElements = ['overallRating', 'qualityRating', 'communicationRating', 'deliveryRating'];
    ratingElements.forEach(elementId => {
        const container = document.getElementById(elementId);
        if (container) {
            const stars = container.querySelectorAll('i');
            stars.forEach(star => {
                star.classList.remove('fas', 'active');
                star.classList.add('far');
            });
        }
        const hintElement = document.getElementById(`${elementId.replace('Rating', '')}Hint`);
        if (hintElement) {
            const defaultHints = {
                overall: 'Select a rating',
                quality: 'Rate the product quality',
                communication: 'Rate the communication with supplier',
                delivery: 'Rate the delivery experience'
            };
            hintElement.textContent = defaultHints[elementId.replace('Rating', '')] || 'Select rating';
            hintElement.style.color = 'var(--gray-400)';
        }
    });
    
    // Reset form fields
    const titleInput = document.getElementById('reviewTitle');
    const textInput = document.getElementById('reviewText');
    const orderInput = document.getElementById('orderReference');
    const anonymousCheck = document.getElementById('anonymousReview');
    const termsCheck = document.getElementById('termsAgree');
    
    if (titleInput) titleInput.value = '';
    if (textInput) textInput.value = '';
    if (orderInput) orderInput.value = '';
    if (anonymousCheck) anonymousCheck.checked = false;
    if (termsCheck) termsCheck.checked = false;
    
    // Clear photos
    uploadedPhotos = [];
    renderPhotoPreviews();
    
    // Disable submit button
    const submitBtn = document.getElementById('submitRatingBtn');
    if (submitBtn) submitBtn.disabled = true;
}

// ============================================
// UI HELPERS
// ============================================
function showSuccessModal() {
    const modal = document.getElementById('successModal');
    if (modal) {
        modal.classList.add('active');
    }
}

function closeSuccessModal() {
    const modal = document.getElementById('successModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function showToast(message, type) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    
    const colors = { success: '#10B981', error: '#EF4444', info: '#6B21E5' };
    toast.style.backgroundColor = colors[type] || colors.info;
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function showError(message) {
    const container = document.querySelector('.main-content');
    if (container) {
        container.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-circle"></i>
                <h3>Error</h3>
                <p>${escapeHtml(message)}</p>
                <a href="suppliers.html" class="back-btn-large">Back to Suppliers</a>
            </div>
        `;
    }
}

function showLoading(show) {
    let overlay = document.getElementById('loadingOverlay');
    if (!overlay && show) {
        overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = '<div class="loading-spinner"></div><p>Submitting...</p>';
        document.body.appendChild(overlay);
    }
    
    if (overlay) {
        overlay.style.display = show ? 'flex' : 'none';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Setup rating stars
    setupRatingStars();
    
    // Setup photo upload
    setupPhotoUpload();
    
    // Form input listeners for validation
    const reviewText = document.getElementById('reviewText');
    if (reviewText) {
        reviewText.addEventListener('input', validateForm);
    }
    
    const termsAgree = document.getElementById('termsAgree');
    if (termsAgree) {
        termsAgree.addEventListener('change', validateForm);
    }
    
    // Form submission
    const form = document.getElementById('ratingForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            submitReview();
        });
    }
    
    // Back button update URL
    const backBtn = document.getElementById('backBtn');
    if (backBtn && supplierId) {
        backBtn.href = `supplier-detail.html?id=${supplierId}`;
    }
}

// Make functions global for onclick
window.closeSuccessModal = closeSuccessModal;