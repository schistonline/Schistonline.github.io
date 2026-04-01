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
let product = null;
let variants = [];
let currentVariant = null;
let supplierWhatsApp = null;

// Get product ID from URL
const urlParams = new URLSearchParams(window.location.search);
const productId = urlParams.get('id');

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    if (!productId) {
        showToast('Product not found', 'error');
        setTimeout(() => window.location.href = 'index.html', 2000);
        return;
    }
    
    await checkAuth();
    await loadProduct();
    await loadVariants();
    await loadSupplierWhatsApp();
    setupEventListeners();
});

// ============================================
// CHECK AUTH
// ============================================
async function checkAuth() {
    try {
        const { data: { user } } = await sb.auth.getUser();
        currentUser = user;
    } catch (error) {
        console.error('Auth check error:', error);
    }
}

// ============================================
// LOAD PRODUCT
// ============================================
async function loadProduct() {
    try {
        showLoading(true, 'Loading product...');
        
        const { data, error } = await sb
            .from('ads')
            .select(`
                *,
                profiles!ads_seller_id_fkey (
                    full_name,
                    business_name,
                    avatar_url,
                    is_verified
                ),
                categories (
                    id,
                    name,
                    slug
                )
            `)
            .eq('id', productId)
            .single();
            
        if (error) throw error;
        
        product = data;
        renderProduct();
        
        // Track view
        trackProductView();
        
    } catch (error) {
        console.error('Error loading product:', error);
        showToast('Error loading product', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================
// LOAD VARIANTS
// ============================================
async function loadVariants() {
    try {
        const { data, error } = await sb
            .from('product_variants')
            .select('*')
            .eq('ad_id', productId)
            .eq('is_active', true)
            .order('display_order', { ascending: true });
            
        if (error) throw error;
        
        variants = data || [];
        
        // If no variants, create a default one from main product
        if (variants.length === 0) {
            variants = [{
                id: null,
                ad_id: productId,
                color_name: 'Default',
                color_code: '#808080',
                image_url: product.image_urls && product.image_urls[0] || 'https://via.placeholder.com/600',
                stock_quantity: product.stock_quantity || 100,
                price: product.price
            }];
        }
        
        // Set current variant to first one
        currentVariant = variants[0];
        renderVariants();
        updateMainImage(currentVariant.image_url);
        
    } catch (error) {
        console.error('Error loading variants:', error);
    }
}

// ============================================
// LOAD SUPPLIER WHATSAPP
// ============================================
async function loadSupplierWhatsApp() {
    try {
        if (!product?.supplier_id) return;
        
        const { data, error } = await sb
            .from('supplier_whatsapp')
            .select('*')
            .eq('supplier_id', product.supplier_id)
            .eq('is_primary', true)
            .single();
            
        if (error && error.code !== 'PGRST116') throw error;
        
        supplierWhatsApp = data;
        
    } catch (error) {
        console.error('Error loading supplier WhatsApp:', error);
    }
}

// ============================================
// RENDER PRODUCT
// ============================================
function renderProduct() {
    // Update page title
    document.title = `${product.title} - iBlue B2B`;
    
    // Update breadcrumb
    document.getElementById('productTitle').textContent = product.title;
    if (product.categories) {
        document.getElementById('categoryLink').textContent = product.categories.name;
        document.getElementById('categoryLink').href = `category.html?id=${product.categories.id}`;
    }
    
    // Update product info
    document.getElementById('productTitle').textContent = product.title;
    document.getElementById('supplierName').textContent = 
        product.profiles?.business_name || product.profiles?.full_name || 'Supplier';
    
    // Update price
    const price = product.price || 0;
    document.getElementById('currentPrice').textContent = formatCurrency(price);
    
    // Calculate discount if wholesale price exists
    if (product.wholesale_price && product.wholesale_price < price) {
        const discount = Math.round((1 - product.wholesale_price / price) * 100);
        document.getElementById('originalPrice').textContent = formatCurrency(price);
        document.getElementById('currentPrice').textContent = formatCurrency(product.wholesale_price);
        document.getElementById('discountBadge').textContent = `-${discount}%`;
    }
    
    // Update stock status
    updateStockStatus(currentVariant);
    
    // Update MOQ
    if (product.moq) {
        document.getElementById('moqInfo').textContent = `(MOQ: ${product.moq} units)`;
        document.getElementById('quantity').min = product.moq;
        document.getElementById('quantity').value = product.moq;
    }
    
    // Update sold count
    if (product.total_sales) {
        document.getElementById('soldCount').textContent = formatNumber(product.total_sales) + ' sold';
    }
    
    // Update description
    document.getElementById('descriptionTab').innerHTML = `
        <div class="description-content">
            <p>${product.description.replace(/\n/g, '</p><p>')}</p>
        </div>
    `;
    
    // Update specifications if available
    renderSpecifications();
}

// ============================================
// RENDER VARIANTS
// ============================================
function renderVariants() {
    const container = document.getElementById('colorOptions');
    
    if (variants.length === 0) {
        container.innerHTML = '<p class="no-variants">No color options available</p>';
        return;
    }
    
    let html = '';
    variants.forEach((variant, index) => {
        const isSelected = currentVariant?.id === variant.id;
        const bgColor = variant.color_code || getColorFromName(variant.color_name);
        
        html += `
            <button class="color-option ${isSelected ? 'selected' : ''}" 
                    data-variant-id="${variant.id}"
                    data-image="${variant.image_url}"
                    data-stock="${variant.stock_quantity}"
                    data-price="${variant.price || product.price}"
                    data-color="${variant.color_name}"
                    style="background-color: ${bgColor};"
                    onclick="selectVariant(${index})">
                ${variant.color_name}
            </button>
        `;
    });
    
    container.innerHTML = html;
    
    // Update selected color text
    if (currentVariant) {
        document.getElementById('selectedColor').textContent = currentVariant.color_name;
    }
}

// ============================================
// SELECT VARIANT
// ============================================
function selectVariant(index) {
    const variant = variants[index];
    if (!variant) return;
    
    currentVariant = variant;
    
    // Update UI
    document.querySelectorAll('.color-option').forEach(btn => btn.classList.remove('selected'));
    document.querySelector(`[data-variant-id="${variant.id}"]`)?.classList.add('selected');
    
    // Update main image
    updateMainImage(variant.image_url);
    
    // Update selected color text
    document.getElementById('selectedColor').textContent = variant.color_name;
    
    // Update price if variant has different price
    if (variant.price) {
        document.getElementById('currentPrice').textContent = formatCurrency(variant.price);
    }
    
    // Update stock status
    updateStockStatus(variant);
    
    // Load variant images if any
    loadVariantImages(variant.id);
}

// ============================================
// UPDATE MAIN IMAGE
// ============================================
function updateMainImage(imageUrl) {
    const mainImage = document.getElementById('mainProductImage');
    mainImage.src = imageUrl;
    
    // Also update zoom modal image
    document.getElementById('zoomedImage').src = imageUrl;
}

// ============================================
// LOAD VARIANT IMAGES
// ============================================
async function loadVariantImages(variantId) {
    try {
        // Get all images for this variant
        const images = [];
        
        // Add main variant image
        if (currentVariant?.image_url) {
            images.push(currentVariant.image_url);
        }
        
        // Add additional product images
        if (product.image_urls && product.image_urls.length) {
            images.push(...product.image_urls.filter(url => url !== currentVariant?.image_url));
        }
        
        renderThumbnails(images);
        
    } catch (error) {
        console.error('Error loading variant images:', error);
    }
}

// ============================================
// RENDER THUMBNAILS
// ============================================
function renderThumbnails(images) {
    const container = document.getElementById('thumbnailContainer');
    
    if (!images || images.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    let html = '';
    images.forEach((image, index) => {
        html += `
            <div class="thumbnail ${index === 0 ? 'active' : ''}" onclick="changeImage('${image}', this)">
                <img src="${image}" alt="Thumbnail ${index + 1}">
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// ============================================
// CHANGE IMAGE
// ============================================
function changeImage(imageUrl, element) {
    updateMainImage(imageUrl);
    
    // Update active thumbnail
    document.querySelectorAll('.thumbnail').forEach(thumb => thumb.classList.remove('active'));
    element.classList.add('active');
}

// ============================================
// UPDATE STOCK STATUS
// ============================================
function updateStockStatus(variant) {
    const stockEl = document.getElementById('stockStatus');
    const stockQtyEl = document.getElementById('stockQuantity');
    const addToCartBtn = document.getElementById('addToCartBtn');
    
    const stock = variant?.stock_quantity || product?.stock_quantity || 0;
    
    if (stock <= 0) {
        stockEl.innerHTML = '<i class="fas fa-times-circle"></i> <span>Out of Stock</span>';
        stockEl.style.color = '#EF4444';
        addToCartBtn.disabled = true;
        addToCartBtn.innerHTML = '<i class="fas fa-times"></i> Out of Stock';
    } else if (stock < 10) {
        stockEl.innerHTML = '<i class="fas fa-exclamation-triangle"></i> <span>Low Stock</span>';
        stockEl.style.color = '#F59E0B';
        stockQtyEl.textContent = `(${stock} left)`;
        addToCartBtn.disabled = false;
    } else {
        stockEl.innerHTML = '<i class="fas fa-check-circle"></i> <span>In Stock</span>';
        stockEl.style.color = '#10B981';
        stockQtyEl.textContent = `(${stock}+ units)`;
        addToCartBtn.disabled = false;
    }
}

// ============================================
// RENDER SPECIFICATIONS
// ============================================
function renderSpecifications() {
    const specs = [];
    
    if (product.condition) specs.push({ label: 'Condition', value: product.condition });
    if (product.brand) specs.push({ label: 'Brand', value: product.brand });
    if (product.model) specs.push({ label: 'Model', value: product.model });
    if (product.moq) specs.push({ label: 'Minimum Order', value: `${product.moq} units` });
    if (product.lead_time_days) specs.push({ label: 'Lead Time', value: `${product.lead_time_days} days` });
    if (product.is_bulk_only) specs.push({ label: 'Type', value: 'Bulk Only' });
    
    if (specs.length === 0) {
        document.getElementById('specificationsTab').innerHTML = '<p>No specifications available</p>';
        return;
    }
    
    let html = '<table class="specs-table">';
    specs.forEach(spec => {
        html += `
            <tr>
                <td>${spec.label}</td>
                <td>${spec.value}</td>
            </tr>
        `;
    });
    html += '</table>';
    
    document.getElementById('specificationsTab').innerHTML = html;
}

// ============================================
// QUANTITY CONTROLS
// ============================================
function incrementQuantity() {
    const input = document.getElementById('quantity');
    const max = product?.stock_quantity || 999;
    const newValue = parseInt(input.value) + 1;
    if (newValue <= max) input.value = newValue;
}

function decrementQuantity() {
    const input = document.getElementById('quantity');
    const min = product?.moq || 1;
    const newValue = parseInt(input.value) - 1;
    if (newValue >= min) input.value = newValue;
}

// ============================================
// WHATSAPP INQUIRY
// ============================================
function openWhatsAppModal() {
    if (!supplierWhatsApp) {
        showToast('Supplier WhatsApp not available', 'error');
        return;
    }
    
    document.getElementById('modalProductName').textContent = product.title;
    document.getElementById('modalSelectedColor').textContent = currentVariant?.color_name || 'Default';
    document.getElementById('modalQuantity').textContent = document.getElementById('quantity').value;
    
    const modal = document.getElementById('whatsappModal');
    modal.classList.add('show');
}

function closeWhatsAppModal() {
    document.getElementById('whatsappModal').classList.remove('show');
}

async function sendWhatsAppInquiry() {
    if (!supplierWhatsApp) {
        showToast('Supplier WhatsApp not available', 'error');
        return;
    }
    
    const quantity = document.getElementById('quantity').value;
    const message = document.getElementById('inquiryMessage').value.trim() || 
        `Hello, I'm interested in ${product.title} (${currentVariant?.color_name || 'Default'}). Quantity: ${quantity}`;
    
    // Create WhatsApp URL
    const whatsappNumber = supplierWhatsApp.whatsapp_number.replace(/\D/g, '');
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;
    
    // Track inquiry
    await trackInquiry();
    
    // Open WhatsApp
    window.open(whatsappUrl, '_blank');
    
    // Close modal
    closeWhatsAppModal();
    
    showToast('Opening WhatsApp...', 'success');
}

// ============================================
// TRACKING FUNCTIONS
// ============================================
async function trackProductView() {
    try {
        await sb
            .from('ad_views')
            .insert({
                ad_id: productId,
                viewer_id: currentUser?.id || null,
                ip_address: await getIPAddress(),
                user_agent: navigator.userAgent
            });
            
        // Update view count in ads table
        await sb.rpc('increment_view_count', { ad_id: productId });
        
    } catch (error) {
        console.error('Error tracking view:', error);
    }
}

async function trackInquiry() {
    try {
        await sb
            .from('ad_engagement')
            .insert({
                ad_id: productId,
                user_id: currentUser?.id || null,
                action: 'whatsapp',
                ip_address: await getIPAddress(),
                user_agent: navigator.userAgent
            });
            
    } catch (error) {
        console.error('Error tracking inquiry:', error);
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-UG', {
        style: 'currency',
        currency: 'UGX',
        minimumFractionDigits: 0
    }).format(amount);
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function getColorFromName(colorName) {
    const colors = {
        'red': '#EF4444',
        'blue': '#3B82F6',
        'green': '#10B981',
        'yellow': '#F59E0B',
        'purple': '#8B5CF6',
        'pink': '#EC4899',
        'black': '#1F2937',
        'white': '#F9FAFB',
        'gray': '#6B7280',
        'brown': '#92400E',
        'orange': '#F97316'
    };
    
    return colors[colorName.toLowerCase()] || '#808080';
}

async function getIPAddress() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch {
        return null;
    }
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-header').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.tab-header').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            this.classList.add('active');
            const tabId = this.dataset.tab;
            document.getElementById(tabId + 'Tab').classList.add('active');
        });
    });
    
    // Zoom modal
    document.getElementById('zoomBtn').addEventListener('click', () => {
        document.getElementById('zoomModal').classList.add('show');
    });
    
    document.querySelectorAll('#zoomModal .close').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('zoomModal').classList.remove('show');
        });
    });
    
    // WhatsApp button
    document.getElementById('whatsappBtn').addEventListener('click', openWhatsAppModal);
    document.getElementById('sendWhatsAppBtn').addEventListener('click', sendWhatsAppInquiry);
    
    // Close modal on outside click
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.remove('show');
        }
    });
    
    // Save product
    document.getElementById('saveBtn').addEventListener('click', toggleSave);
}

async function toggleSave() {
    if (!currentUser) {
        showToast('Please login to save products', 'error');
        setTimeout(() => window.location.href = 'login.html', 1500);
        return;
    }
    
    const btn = document.getElementById('saveBtn');
    const icon = btn.querySelector('i');
    
    try {
        // Check if already saved
        const { data: existing } = await sb
            .from('saved_ads')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('ad_id', productId)
            .maybeSingle();
            
        if (existing) {
            // Remove from saved
            await sb
                .from('saved_ads')
                .delete()
                .eq('id', existing.id);
                
            icon.className = 'far fa-heart';
            showToast('Removed from saved', 'success');
        } else {
            // Add to saved
            await sb
                .from('saved_ads')
                .insert({
                    user_id: currentUser.id,
                    ad_id: productId
                });
                
            icon.className = 'fas fa-heart';
            showToast('Added to saved', 'success');
            
            // Track save action
            await sb
                .from('ad_engagement')
                .insert({
                    ad_id: productId,
                    user_id: currentUser.id,
                    action: 'save'
                });
        }
    } catch (error) {
        console.error('Error toggling save:', error);
        showToast('Error saving product', 'error');
    }
}

// ============================================
// SHARE PRODUCT
// ============================================
function shareProduct() {
    const shareData = {
        title: product.title,
        text: `Check out ${product.title} on iBlue B2B`,
        url: window.location.href
    };
    
    if (navigator.share) {
        navigator.share(shareData);
    } else {
        // Fallback - copy to clipboard
        navigator.clipboard.writeText(window.location.href);
        showToast('Link copied to clipboard!', 'success');
    }
}

// ============================================
// TOAST AND LOADING
// ============================================
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

function showLoading(show, message = 'Loading...') {
    const overlay = document.getElementById('loadingOverlay');
    const messageEl = document.querySelector('#loadingOverlay p');
    
    if (overlay) {
        if (messageEl) messageEl.textContent = message;
        overlay.classList.toggle('show', show);
    }
}