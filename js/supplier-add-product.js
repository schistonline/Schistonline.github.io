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
let supplierProfile = null;
let currentStep = 1;
let categories = [];
let mainImageFile = null;
let galleryImages = [];
let bulkTiers = [];
let tagify = null;

// Enhanced compression profiles for cost optimization
const compressionProfiles = {
    main: {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1200,
        useWebWorker: true,
        fileType: 'image/webp',
        initialQuality: 0.8,
        alwaysKeepResolution: false,
        maxIteration: 10
    },
    gallery: {
        maxSizeMB: 0.3,
        maxWidthOrHeight: 800,
        useWebWorker: true,
        fileType: 'image/webp',
        initialQuality: 0.75,
        alwaysKeepResolution: false,
        maxIteration: 10
    }
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📱 Page loaded, initializing...');
    await checkAuth();
    await loadSupplierProfile();
    await loadCategories();
    setupEventListeners();
    initTagify();
    setupImageUploads();
    updateCharCounters();
});

// ============================================
// AUTHENTICATION
// ============================================
async function checkAuth() {
    try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) {
            showToast('Please login to add products', 'error');
            setTimeout(() => {
                window.location.href = 'login.html?redirect=supplier-add-product.html';
            }, 2000);
            return;
        }
        currentUser = user;
        console.log('✅ User authenticated:', user.id);
    } catch (error) {
        console.error('❌ Auth error:', error);
        window.location.href = 'login.html';
    }
}

async function loadSupplierProfile() {
    try {
        const { data, error } = await sb
            .from('suppliers')
            .select('*')
            .eq('profile_id', currentUser.id)
            .single();
            
        if (error) throw error;
        supplierProfile = data;
        console.log('✅ Supplier profile loaded:', supplierProfile.id);
    } catch (error) {
        console.error('❌ Error loading supplier profile:', error);
        showToast('Error loading supplier profile');
    }
}

// ============================================
// LOAD CATEGORIES
// ============================================
async function loadCategories() {
    try {
        console.log('📥 Loading categories...');
        const { data, error } = await sb
            .from('categories')
            .select('id, name, parent_id')
            .eq('is_active', true)
            .order('name');
            
        if (error) throw error;
        
        categories = (data || []).map(c => ({
            id: parseInt(c.id),
            name: c.name,
            parent_id: c.parent_id ? parseInt(c.parent_id) : null
        }));
        
        console.log('✅ Loaded categories:', categories.length);
        
        // Populate main category dropdown
        const mainCategories = categories.filter(c => !c.parent_id);
        const select = document.getElementById('productCategory');
        
        select.innerHTML = '<option value="">Select category</option>' +
            mainCategories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
        
        // Initialize Select2 for better UX
        if (typeof $ !== 'undefined' && $.fn.select2) {
            $('#productCategory').select2({
                placeholder: 'Select category',
                width: '100%'
            }).on('change', function(e) {
                // Trigger our handler when Select2 changes
                console.log('📋 Select2 category changed to:', e.target.value);
                loadSubcategories(e.target.value);
            });
        }
        
    } catch (error) {
        console.error('❌ Error loading categories:', error);
        showToast('Failed to load categories');
    }
}

// ============================================
// LOAD SUBCATEGORIES - MULTIPLE APPROACHES
// ============================================
async function loadSubcategories(categoryId) {
    const subcatSelect = document.getElementById('productSubcategory');
    
    console.log('🔍 Loading subcategories for category:', categoryId, 'Type:', typeof categoryId);
    
    if (!categoryId || categoryId === '' || categoryId === 'null' || categoryId === 'undefined') {
        console.log('⚠️ No category selected');
        subcatSelect.innerHTML = '<option value="">Select category first</option>';
        subcatSelect.disabled = true;
        return;
    }
    
    // Convert to number
    const catId = parseInt(categoryId);
    console.log('🔢 Parsed category ID:', catId, 'Type:', typeof catId);
    
    // Show loading state
    subcatSelect.innerHTML = '<option value="">Loading subcategories...</option>';
    subcatSelect.disabled = true;
    
    try {
        // APPROACH 1: Direct database query (most reliable)
        console.log('📡 Querying subcategories from database for parent_id:', catId);
        const { data: dbSubs, error: dbError } = await sb
            .from('categories')
            .select('id, name, parent_id')
            .eq('parent_id', catId)
            .eq('is_active', true)
            .order('name');
            
        if (dbError) throw dbError;
        
        console.log('📊 Database returned:', dbSubs?.length || 0, 'subcategories');
        
        if (dbSubs && dbSubs.length > 0) {
            // Use database results
            subcatSelect.innerHTML = '<option value="">Select subcategory (optional)</option>' +
                dbSubs.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
            subcatSelect.disabled = false;
            console.log('✅ Populated from database with', dbSubs.length, 'subcategories');
            
            // Refresh Select2
            if (typeof $ !== 'undefined' && $.fn.select2) {
                $('#productSubcategory').select2({
                    placeholder: 'Select subcategory (optional)',
                    width: '100%',
                    allowClear: true
                });
            }
            return;
        }
        
        // APPROACH 2: Try client-side filtering as fallback
        console.log('⚠️ No database results, trying client-side filtering...');
        console.log('Categories in memory:', categories.length);
        
        const subs = categories.filter(c => {
            const match = c.parent_id === catId;
            if (match) {
                console.log('✓ Found match:', c.name, '(ID:', c.id, 'parent:', c.parent_id, ')');
            }
            return match;
        });
        
        console.log('🔍 Client-side filtering found:', subs.length, 'subcategories');
        
        if (subs.length > 0) {
            subcatSelect.innerHTML = '<option value="">Select subcategory (optional)</option>' +
                subs.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
            subcatSelect.disabled = false;
            console.log('✅ Populated from client cache with', subs.length, 'subcategories');
            
            if (typeof $ !== 'undefined' && $.fn.select2) {
                $('#productSubcategory').select2({
                    placeholder: 'Select subcategory (optional)',
                    width: '100%',
                    allowClear: true
                });
            }
            return;
        }
        
        // No subcategories found
        console.log('ℹ️ No subcategories found for category', catId);
        subcatSelect.innerHTML = '<option value="">No subcategories available</option>';
        subcatSelect.disabled = true;
        
    } catch (error) {
        console.error('❌ Error in loadSubcategories:', error);
        
        // Fallback to client-side filtering
        try {
            console.log('⚠️ Attempting client-side fallback...');
            const subs = categories.filter(c => c.parent_id === catId);
            
            if (subs.length > 0) {
                subcatSelect.innerHTML = '<option value="">Select subcategory (optional)</option>' +
                    subs.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
                subcatSelect.disabled = false;
                console.log('✅ Fallback successful with', subs.length, 'subcategories');
            } else {
                subcatSelect.innerHTML = '<option value="">No subcategories available</option>';
                subcatSelect.disabled = true;
            }
        } catch (fallbackError) {
            console.error('❌ Fallback also failed:', fallbackError);
            subcatSelect.innerHTML = '<option value="">Error loading subcategories</option>';
            subcatSelect.disabled = true;
        }
    }
}

// ============================================
// DEBUG FUNCTION - Test direct database connection
// ============================================
async function testDatabaseConnection() {
    console.log('🧪 Testing database connection...');
    try {
        const { data, error } = await sb
            .from('categories')
            .select('count')
            .limit(1);
            
        if (error) {
            console.error('❌ Database connection failed:', error);
            showToast('Database connection error', 'error');
        } else {
            console.log('✅ Database connection successful');
        }
    } catch (e) {
        console.error('❌ Database test failed:', e);
    }
}

// Call test on load
setTimeout(testDatabaseConnection, 2000);

// ============================================
// TAGS INPUT
// ============================================
function initTagify() {
    const input = document.getElementById('productTags');
    if (!input) return;
    
    tagify = new Tagify(input, {
        delimiters: ",| ",
        maxTags: 10,
        placeholder: "Add tags...",
        duplicates: false,
        transformTag: (tagData) => {
            tagData.value = tagData.value.toLowerCase();
        }
    });
}

// ============================================
// BULK PRICING TIERS
// ============================================
window.addBulkTier = function() {
    const container = document.getElementById('bulkPricingContainer');
    const tierId = Date.now();
    
    const tierHtml = `
        <div class="bulk-tier" data-tier-id="${tierId}">
            <div class="bulk-tier-header">
                <span class="bulk-tier-title">Bulk Pricing Tier</span>
                <span class="remove-tier" onclick="removeBulkTier(${tierId})">
                    <i class="fas fa-trash"></i>
                </span>
            </div>
            <div class="bulk-tier-row">
                <div class="form-group">
                    <label>Min Quantity</label>
                    <input type="number" class="form-input tier-min" min="1" value="10">
                </div>
                <div class="form-group">
                    <label>Max Quantity</label>
                    <input type="number" class="form-input tier-max" min="1" placeholder="Unlimited">
                </div>
                <div class="form-group">
                    <label>Price per Unit (UGX)</label>
                    <input type="number" class="form-input tier-price" min="0" step="100">
                </div>
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', tierHtml);
    bulkTiers.push(tierId);
};

window.removeBulkTier = function(tierId) {
    const tier = document.querySelector(`[data-tier-id="${tierId}"]`);
    if (tier) {
        tier.remove();
        bulkTiers = bulkTiers.filter(id => id !== tierId);
    }
};

// ============================================
// SETUP EVENT LISTENERS
// ============================================
function setupEventListeners() {
    console.log('🔧 Setting up event listeners');
    
    // Category change - Direct DOM event
    const categorySelect = document.getElementById('productCategory');
    if (categorySelect) {
        categorySelect.addEventListener('change', function(e) {
            console.log('📋 DOM category changed to:', e.target.value);
            loadSubcategories(e.target.value);
        });
        console.log('✅ Added change listener to category select');
    } else {
        console.error('❌ Category select element not found');
    }
    
    // Also add a click listener for debugging
    categorySelect?.addEventListener('click', function() {
        console.log('👆 Category select clicked, current value:', this.value);
    });
    
    // Step navigation
    document.getElementById('continueToStep2')?.addEventListener('click', () => {
        if (validateStep1()) {
            goToStep(2);
        }
    });
    
    document.getElementById('continueToStep3')?.addEventListener('click', () => {
        if (validateStep2()) {
            goToStep(3);
        }
    });
    
    document.getElementById('continueToStep4')?.addEventListener('click', () => {
        if (validateStep3()) {
            goToStep(4);
        }
    });
    
    document.getElementById('backToStep1')?.addEventListener('click', () => goToStep(1));
    document.getElementById('backToStep2')?.addEventListener('click', () => goToStep(2));
    document.getElementById('backToStep3')?.addEventListener('click', () => goToStep(3));
    
    // Submit product
    document.getElementById('submitProduct')?.addEventListener('click', submitProduct);
    
    // Character counters
    document.getElementById('productTitle')?.addEventListener('input', updateCharCounters);
    document.getElementById('productDescription')?.addEventListener('input', updateCharCounters);
    
    // Price validation
    document.getElementById('salePrice')?.addEventListener('input', validateSalePrice);
}

// ============================================
// CHARACTER COUNTERS
// ============================================
function updateCharCounters() {
    const title = document.getElementById('productTitle')?.value || '';
    const desc = document.getElementById('productDescription')?.value || '';
    
    document.getElementById('titleCount').textContent = title.length;
    document.getElementById('descCount').textContent = desc.length;
}

function validateSalePrice() {
    const regular = parseFloat(document.getElementById('regularPrice').value) || 0;
    const sale = parseFloat(document.getElementById('salePrice').value) || 0;
    
    if (sale > regular) {
        showToast('Sale price cannot be higher than regular price', 'warning');
        document.getElementById('salePrice').value = '';
    }
}

// ============================================
// ENHANCED IMAGE UPLOAD WITH COST OPTIMIZATION
// ============================================
function setupImageUploads() {
    // Main image upload
    const mainUpload = document.getElementById('mainImageUpload');
    const mainInput = document.getElementById('mainImage');
    
    if (mainUpload && mainInput) {
        mainUpload.addEventListener('click', () => mainInput.click());
        
        mainInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                await processImageWithOptions(file, 'main');
            }
        });
        
        // Drag and drop
        setupDragAndDrop(mainUpload, (file) => processImageWithOptions(file, 'main'));
    }
    
    // Gallery upload
    const galleryUpload = document.getElementById('galleryUpload');
    const galleryInput = document.getElementById('galleryImages');
    
    if (galleryUpload && galleryInput) {
        galleryUpload.addEventListener('click', () => galleryInput.click());
        
        galleryInput.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);
            for (const file of files) {
                if (galleryImages.length >= 5) {
                    showToast('Maximum 5 gallery images allowed', 'warning');
                    break;
                }
                await processImageWithOptions(file, 'gallery');
            }
        });
        
        // Drag and drop
        setupDragAndDrop(galleryUpload, async (file) => {
            if (galleryImages.length >= 5) {
                showToast('Maximum 5 gallery images allowed', 'warning');
                return;
            }
            await processImageWithOptions(file, 'gallery');
        }, true);
    }
}

function setupDragAndDrop(element, callback, multiple = false) {
    element.addEventListener('dragover', (e) => {
        e.preventDefault();
        element.classList.add('dragover');
    });
    
    element.addEventListener('dragleave', () => {
        element.classList.remove('dragover');
    });
    
    element.addEventListener('drop', async (e) => {
        e.preventDefault();
        element.classList.remove('dragover');
        
        if (multiple) {
            const files = Array.from(e.dataTransfer.files);
            for (const file of files) {
                await callback(file);
            }
        } else {
            const file = e.dataTransfer.files[0];
            if (file) await callback(file);
        }
    });
}

async function processImageWithOptions(file, type) {
    // Validate file type
    if (!file.type.startsWith('image/')) {
        showToast('Please upload an image file', 'error');
        return;
    }
    
    // Get file size in MB
    const fileSizeMB = file.size / (1024 * 1024);
    
    // Warn if file is too large
    if (fileSizeMB > 20) {
        showToast('Image is very large (>20MB). It will be heavily compressed.', 'warning');
    } else if (fileSizeMB > 10) {
        showToast('Large image detected. Compressing to save costs.', 'info');
    }
    
    showCompressionModal(`Optimizing ${file.name}...`);
    
    try {
        // Select compression profile based on type
        const profile = type === 'main' ? compressionProfiles.main : compressionProfiles.gallery;
        
        // Update progress
        updateCompressionProgress(10, 'Analyzing image...');
        
        // For very large images (>5MP), resize more aggressively
        if (fileSizeMB > 5) {
            const img = await createImageBitmap(file);
            if (img.width > 2000 || img.height > 2000) {
                profile.maxWidthOrHeight = type === 'main' ? 1000 : 600;
            }
        }
        
        updateCompressionProgress(30, 'Compressing image...');
        
        // Compress image
        const compressedFile = await imageCompression(file, profile);
        
        // Calculate compression stats
        const originalSizeKB = (file.size / 1024).toFixed(0);
        const compressedSizeKB = (compressedFile.size / 1024).toFixed(0);
        const compressionRatio = ((1 - compressedFile.size / file.size) * 100).toFixed(0);
        const costSavings = (file.size - compressedFile.size) / (1024 * 1024); // MB saved
        
        console.log(`📸 Compression stats for ${type}:`, {
            original: `${originalSizeKB}KB`,
            compressed: `${compressedSizeKB}KB`,
            saved: `${compressionRatio}%`,
            mb_saved: costSavings.toFixed(2) + 'MB'
        });
        
        updateCompressionProgress(80, 'Creating preview...');
        
        // Store based on type
        if (type === 'main') {
            mainImageFile = compressedFile;
            createImagePreview(compressedFile, 'mainImagePreview');
            
            // Show savings info
            showToast(`Saved ${compressionRatio}% (${costSavings.toFixed(2)}MB)`, 'success');
        } else {
            galleryImages.push(compressedFile);
            updateGalleryPreview();
        }
        
        updateCompressionProgress(100, 'Complete!');
        
        setTimeout(() => {
            hideCompressionModal();
        }, 500);
        
    } catch (error) {
        console.error('Error processing image:', error);
        hideCompressionModal();
        showToast('Failed to process image. Using original.', 'warning');
        
        // Fallback to original file
        if (type === 'main') {
            mainImageFile = file;
            createImagePreview(file, 'mainImagePreview');
        } else {
            galleryImages.push(file);
            updateGalleryPreview();
        }
    }
}

function createImagePreview(file, elementId) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById(elementId);
        preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
        
        // Add size info
        const sizeKB = (file.size / 1024).toFixed(0);
        const sizeInfo = document.createElement('small');
        sizeInfo.className = 'image-size-info';
        sizeInfo.textContent = `${sizeKB}KB • WebP`;
        preview.appendChild(sizeInfo);
    };
    reader.readAsDataURL(file);
}

function updateGalleryPreview() {
    const preview = document.getElementById('galleryPreview');
    preview.innerHTML = galleryImages.map((file, index) => {
        const url = URL.createObjectURL(file);
        const sizeKB = (file.size / 1024).toFixed(0);
        return `
            <div class="gallery-preview-item">
                <img src="${url}" alt="Gallery image ${index + 1}">
                <span class="image-size-badge">${sizeKB}KB</span>
                <button class="gallery-preview-remove" onclick="removeGalleryImage(${index})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    }).join('');
}

window.removeGalleryImage = function(index) {
    galleryImages.splice(index, 1);
    updateGalleryPreview();
};

function showCompressionModal(message) {
    const modal = document.getElementById('compressionModal');
    const status = document.getElementById('compressionStatus');
    const progress = document.getElementById('compressionProgress');
    
    status.textContent = message;
    progress.style.width = '0%';
    modal.classList.add('show');
}

function updateCompressionProgress(percent, message) {
    const status = document.getElementById('compressionStatus');
    const progress = document.getElementById('compressionProgress');
    
    if (status && message) {
        status.textContent = message;
    }
    
    if (progress) {
        progress.style.width = percent + '%';
    }
}

function hideCompressionModal() {
    const modal = document.getElementById('compressionModal');
    modal.classList.remove('show');
}

// ============================================
// STEP NAVIGATION
// ============================================
function goToStep(step) {
    currentStep = step;
    
    // Update step indicators
    for (let i = 1; i <= 4; i++) {
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
    for (let i = 1; i <= 4; i++) {
        const content = document.getElementById(`step${i}`);
        if (content) {
            content.classList.toggle('active', i === step);
        }
    }
    
    // Step-specific initialization
    if (step === 4) {
        renderReview();
    }
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================
// VALIDATE STEP 1
// ============================================
function validateStep1() {
    const title = document.getElementById('productTitle').value.trim();
    const description = document.getElementById('productDescription').value.trim();
    const category = document.getElementById('productCategory').value;
    const condition = document.getElementById('productCondition').value;
    
    if (!title) {
        showToast('Please enter a product title', 'error');
        return false;
    }
    
    if (title.length < 10) {
        showToast('Product title must be at least 10 characters', 'error');
        return false;
    }
    
    if (!description) {
        showToast('Please enter a product description', 'error');
        return false;
    }
    
    if (description.length < 50) {
        showToast('Product description must be at least 50 characters', 'error');
        return false;
    }
    
    if (!category) {
        showToast('Please select a category', 'error');
        return false;
    }
    
    if (!condition) {
        showToast('Please select product condition', 'error');
        return false;
    }
    
    return true;
}

// ============================================
// VALIDATE STEP 2
// ============================================
function validateStep2() {
    const regularPrice = document.getElementById('regularPrice').value;
    const stock = document.getElementById('stockQuantity').value;
    const moq = document.getElementById('moq').value;
    const leadTime = document.getElementById('leadTime').value;
    
    if (!regularPrice || regularPrice < 0) {
        showToast('Please enter a valid regular price', 'error');
        return false;
    }
    
    if (parseFloat(regularPrice) < 100) {
        showToast('Price must be at least UGX 100', 'error');
        return false;
    }
    
    if (!stock || stock < 0) {
        showToast('Please enter a valid stock quantity', 'error');
        return false;
    }
    
    if (!moq || moq < 1) {
        showToast('Please enter a valid minimum order quantity', 'error');
        return false;
    }
    
    if (moq > parseInt(stock)) {
        showToast('MOQ cannot exceed available stock', 'error');
        return false;
    }
    
    if (!leadTime || leadTime < 1) {
        showToast('Please enter a valid lead time', 'error');
        return false;
    }
    
    // Validate bulk tiers
    let tierValid = true;
    document.querySelectorAll('.bulk-tier').forEach(tier => {
        const min = tier.querySelector('.tier-min')?.value;
        const price = tier.querySelector('.tier-price')?.value;
        
        if (min && !price) {
            showToast('Please enter price for all bulk tiers', 'error');
            tierValid = false;
        }
        
        if (price && parseFloat(price) > parseFloat(regularPrice)) {
            showToast('Bulk price cannot be higher than regular price', 'error');
            tierValid = false;
        }
    });
    
    return tierValid;
}

// ============================================
// VALIDATE STEP 3
// ============================================
function validateStep3() {
    if (!mainImageFile) {
        showToast('Please upload a main product image', 'error');
        return false;
    }
    
    return true;
}

// ============================================
// RENDER REVIEW
// ============================================
function renderReview() {
    const container = document.getElementById('reviewContainer');
    
    // Get all form values
    const title = document.getElementById('productTitle').value;
    const description = document.getElementById('productDescription').value;
    const category = document.getElementById('productCategory').selectedOptions[0]?.text || 'N/A';
    const subcategory = document.getElementById('productSubcategory').selectedOptions[0]?.text || 'None';
    const brand = document.getElementById('productBrand').value || 'Not specified';
    const model = document.getElementById('productModel').value || 'Not specified';
    const condition = document.getElementById('productCondition').value;
    const sku = document.getElementById('productSku').value || 'Not specified';
    const tags = tagify ? tagify.value.map(t => t.value).join(', ') : 'None';
    
    const regularPrice = document.getElementById('regularPrice').value;
    const salePrice = document.getElementById('salePrice').value;
    const isNegotiable = document.getElementById('isNegotiable').checked;
    const stock = document.getElementById('stockQuantity').value;
    const lowStock = document.getElementById('lowStockThreshold').value;
    const moq = document.getElementById('moq').value;
    const maxOrder = document.getElementById('maxOrderQuantity').value || 'Unlimited';
    const leadTime = document.getElementById('leadTime').value;
    
    // Collect bulk tiers
    const tiers = [];
    document.querySelectorAll('.bulk-tier').forEach(tier => {
        const min = tier.querySelector('.tier-min')?.value;
        const max = tier.querySelector('.tier-max')?.value;
        const price = tier.querySelector('.tier-price')?.value;
        if (min && price) {
            tiers.push({ min, max, price });
        }
    });
    
    let reviewHtml = `
        <div class="review-card">
            <div class="review-header">
                <span class="review-title">Basic Information</span>
                <span class="review-edit" onclick="goToStep(1)">
                    <i class="fas fa-edit"></i> Edit
                </span>
            </div>
            <div class="review-row">
                <span class="review-label">Title:</span>
                <span class="review-value">${escapeHtml(title)}</span>
            </div>
            <div class="review-row">
                <span class="review-label">Description:</span>
                <span class="review-value">${escapeHtml(description.substring(0, 100))}...</span>
            </div>
            <div class="review-row">
                <span class="review-label">Category:</span>
                <span class="review-value">${escapeHtml(category)} / ${escapeHtml(subcategory)}</span>
            </div>
            <div class="review-row">
                <span class="review-label">Brand:</span>
                <span class="review-value">${escapeHtml(brand)}</span>
            </div>
            <div class="review-row">
                <span class="review-label">Model:</span>
                <span class="review-value">${escapeHtml(model)}</span>
            </div>
            <div class="review-row">
                <span class="review-label">Condition:</span>
                <span class="review-value">${escapeHtml(condition)}</span>
            </div>
            <div class="review-row">
                <span class="review-label">SKU:</span>
                <span class="review-value">${escapeHtml(sku)}</span>
            </div>
            <div class="review-row">
                <span class="review-label">Tags:</span>
                <span class="review-value">${escapeHtml(tags)}</span>
            </div>
        </div>
        
        <div class="review-card">
            <div class="review-header">
                <span class="review-title">Pricing & Stock</span>
                <span class="review-edit" onclick="goToStep(2)">
                    <i class="fas fa-edit"></i> Edit
                </span>
            </div>
            <div class="review-row">
                <span class="review-label">Regular Price:</span>
                <span class="review-value">UGX ${formatNumber(regularPrice)}</span>
            </div>
            ${salePrice ? `
            <div class="review-row">
                <span class="review-label">Sale Price:</span>
                <span class="review-value">UGX ${formatNumber(salePrice)}</span>
            </div>
            ` : ''}
            <div class="review-row">
                <span class="review-label">Negotiable:</span>
                <span class="review-value">${isNegotiable ? 'Yes' : 'No'}</span>
            </div>
            ${tiers.length > 0 ? `
            <div class="review-row">
                <span class="review-label">Bulk Pricing:</span>
                <span class="review-value">${tiers.length} tier(s)</span>
            </div>
            ` : ''}
            <div class="review-row">
                <span class="review-label">Stock:</span>
                <span class="review-value">${formatNumber(stock)} units (Alert at ${lowStock})</span>
            </div>
            <div class="review-row">
                <span class="review-label">MOQ:</span>
                <span class="review-value">${moq} units</span>
            </div>
            <div class="review-row">
                <span class="review-label">Max Order:</span>
                <span class="review-value">${maxOrder}</span>
            </div>
            <div class="review-row">
                <span class="review-label">Lead Time:</span>
                <span class="review-value">${leadTime} days</span>
            </div>
        </div>
        
        <div class="review-card">
            <div class="review-header">
                <span class="review-title">Images</span>
                <span class="review-edit" onclick="goToStep(3)">
                    <i class="fas fa-edit"></i> Edit
                </span>
            </div>
            <div class="review-row">
                <span class="review-label">Main Image:</span>
                <div class="review-images">
                    <div class="review-image">
                        <img src="${URL.createObjectURL(mainImageFile)}" alt="Main">
                        <span class="image-size-badge">${(mainImageFile.size / 1024).toFixed(0)}KB</span>
                    </div>
                </div>
            </div>
            ${galleryImages.length > 0 ? `
            <div class="review-row">
                <span class="review-label">Gallery:</span>
                <div class="review-images">
                    ${galleryImages.slice(0, 3).map(file => `
                        <div class="review-image">
                            <img src="${URL.createObjectURL(file)}" alt="Gallery">
                            <span class="image-size-badge">${(file.size / 1024).toFixed(0)}KB</span>
                        </div>
                    `).join('')}
                    ${galleryImages.length > 3 ? `<div class="review-image">+${galleryImages.length - 3}</div>` : ''}
                </div>
            </div>
            ` : ''}
        </div>
    `;
    
    container.innerHTML = reviewHtml;
}

// ============================================
// BATCH IMAGE UPLOAD WITH OPTIMIZATION
// ============================================
async function uploadImages() {
    const imageUrls = [];
    const timestamp = Date.now();
    const supplierId = supplierProfile.id;
    
    showLoading(true, 'Uploading optimized images...');
    
    try {
        // Upload main image
        if (mainImageFile) {
            const mainPath = `products/${supplierId}/${timestamp}_main.webp`;
            
            const { error: mainError } = await sb.storage
                .from('product-images')
                .upload(mainPath, mainImageFile, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: 'image/webp'
                });
                
            if (mainError) throw mainError;
            
            const { data: { publicUrl } } = sb.storage
                .from('product-images')
                .getPublicUrl(mainPath);
                
            imageUrls.push(publicUrl);
        }
        
        // Upload gallery images in parallel for speed
        if (galleryImages.length > 0) {
            const uploadPromises = galleryImages.map(async (file, index) => {
                const galleryPath = `products/${supplierId}/${timestamp}_gallery_${index}.webp`;
                
                const { error } = await sb.storage
                    .from('product-images')
                    .upload(galleryPath, file, {
                        cacheControl: '3600',
                        upsert: false,
                        contentType: 'image/webp'
                    });
                    
                if (error) throw error;
                
                const { data: { publicUrl } } = sb.storage
                    .from('product-images')
                    .getPublicUrl(galleryPath);
                    
                return publicUrl;
            });
            
            const galleryUrls = await Promise.all(uploadPromises);
            imageUrls.push(...galleryUrls);
        }
        
        // Calculate total storage saved
        const totalOriginalSize = (mainImageFile?.size || 0) + galleryImages.reduce((sum, f) => sum + f.size, 0);
        const totalOriginalMB = (totalOriginalSize / (1024 * 1024)).toFixed(2);
        
        showToast(`Uploaded ${imageUrls.length} images (${totalOriginalMB}MB compressed)`, 'success');
        
        return imageUrls;
        
    } catch (error) {
        console.error('Error uploading images:', error);
        throw new Error('Failed to upload images');
    } finally {
        showLoading(false);
    }
}

// ============================================
// GENERATE SLUG
// ============================================
function generateSlug(title) {
    return title.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') + '-' + Date.now();
}

// ============================================
// SAVE BULK PRICING TIERS
// ============================================
async function saveBulkPricingTiers(productId) {
    const tiers = [];
    
    document.querySelectorAll('.bulk-tier').forEach(tier => {
        const min = tier.querySelector('.tier-min')?.value;
        const max = tier.querySelector('.tier-max')?.value;
        const price = tier.querySelector('.tier-price')?.value;
        
        if (min && price) {
            tiers.push({
                ad_id: productId,
                min_quantity: parseInt(min),
                max_quantity: max ? parseInt(max) : null,
                price_per_unit: parseFloat(price),
                is_active: true
            });
        }
    });
    
    if (tiers.length > 0) {
        const { error } = await sb
            .from('bulk_pricing')
            .insert(tiers);
            
        if (error) throw error;
    }
}

// ============================================
// SUBMIT PRODUCT
// ============================================
async function submitProduct() {
    const terms = document.getElementById('acceptTerms').checked;
    
    if (!terms) {
        showToast('Please confirm that the information is accurate', 'error');
        return;
    }
    
    showLoading(true, 'Uploading product...');
    
    try {
        // Upload images to storage
        const imageUrls = await uploadImages();
        
        // Generate slug from title
        const title = document.getElementById('productTitle').value;
        const slug = generateSlug(title);
        
        // Get tags
        let tags = [];
        if (tagify) {
            tags = tagify.value.map(t => t.value);
        }
        
        // Collect all form data
        const productData = {
            title: title,
            slug: slug,
            description: document.getElementById('productDescription').value,
            price: parseFloat(document.getElementById('regularPrice').value),
            wholesale_price: document.getElementById('salePrice').value ? parseFloat(document.getElementById('salePrice').value) : null,
            currency: 'UGX',
            is_negotiable: document.getElementById('isNegotiable').checked,
            condition: document.getElementById('productCondition').value,
            image_urls: imageUrls,
            video_url: document.getElementById('productVideo').value || null,
            category_id: parseInt(document.getElementById('productCategory').value),
            subcategory_id: document.getElementById('productSubcategory').value ? parseInt(document.getElementById('productSubcategory').value) : null,
            seller_id: currentUser.id,
            supplier_id: supplierProfile.id,
            moq: parseInt(document.getElementById('moq').value),
            lead_time_days: parseInt(document.getElementById('leadTime').value),
            stock_quantity: parseInt(document.getElementById('stockQuantity').value),
            low_stock_threshold: parseInt(document.getElementById('lowStockThreshold').value),
            sku: document.getElementById('productSku').value || null,
            brand: document.getElementById('productBrand').value || null,
            model: document.getElementById('productModel').value || null,
            max_order_quantity: document.getElementById('maxOrderQuantity').value ? parseInt(document.getElementById('maxOrderQuantity').value) : null,
            tags: tags,
            status: 'active',
            view_count: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        console.log('📦 Submitting product:', productData);
        
        // Insert product
        const { data, error } = await sb
            .from('ads')
            .insert(productData)
            .select()
            .single();
            
        if (error) throw error;
        
        console.log('✅ Product created:', data);
        
        // Save bulk pricing tiers if any
        if (document.querySelectorAll('.bulk-tier').length > 0) {
            await saveBulkPricingTiers(data.id);
        }
        
        // Show success modal
        showLoading(false);
        document.getElementById('successModal').classList.add('show');
        
    } catch (error) {
        console.error('❌ Error submitting product:', error);
        showLoading(false);
        showToast(error.message || 'Failed to submit product', 'error');
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function showLoading(show, message = 'Loading...') {
    const overlay = document.getElementById('loadingOverlay');
    const messageEl = document.getElementById('loadingMessage');
    
    if (!overlay || !messageEl) return;
    
    if (show) {
        messageEl.textContent = message;
        overlay.classList.add('show');
    } else {
        overlay.classList.remove('show');
    }
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    const colors = {
        success: '#10B981',
        error: '#EF4444',
        info: '#0B4F6C',
        warning: '#F59E0B'
    };
    
    toast.style.backgroundColor = colors[type] || colors.info;
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function formatNumber(num) {
    return parseInt(num).toLocaleString('en-UG');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Modal functions
window.closeSuccessModal = function() {
    document.getElementById('successModal').classList.remove('show');
    window.location.href = 'supplier-products.html';
};

// Make functions globally available
window.addBulkTier = addBulkTier;
window.removeBulkTier = removeBulkTier;
window.removeGalleryImage = removeGalleryImage;
window.goToStep = goToStep;
window.closeSuccessModal = closeSuccessModal;