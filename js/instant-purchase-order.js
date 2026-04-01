// ============================================
// INSTANT PURCHASE ORDER - WITH COLUMN FALLBACK
// ============================================

const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
let currentUser = null;
let currentUserProfile = null;
let currentStep = 1;
let selectedSupplier = null;
let isManualSupplier = false;
let cart = [];
let availableProducts = [];
let availableSuppliers = [];
let uploadedFiles = [];

// Form data for step 3
let poData = {
    paymentMethod: '',
    paymentTerms: 'advance_full',
    mobileMoneyNumber: '',
    mobileMoneyNetwork: 'mtn',
    bankName: '',
    accountNumber: '',
    deliveryTerms: 'door_delivery',
    expectedDelivery: '',
    deliveryAddress: '',
    deliveryDistrict: '',
    deliveryPhone: '',
    internalReference: '',
    supplierNotes: ''
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await loadDistricts();
    await loadSuppliers();
    await loadProducts();
    setupEventListeners();
    setMinDeliveryDate();
    
    const urlParams = new URLSearchParams(window.location.search);
    const supplierId = urlParams.get('supplier');
    if (supplierId) {
        await selectSupplierById(supplierId);
    }
});

// ============================================
// AUTHENTICATION
// ============================================
async function checkAuth() {
    try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) {
            window.location.href = 'login.html?redirect=instant-purchase-order.html';
            return;
        }
        currentUser = user;
        
        const { data: profile } = await sb
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
            
        currentUserProfile = profile;
        
    } catch (error) {
        console.error('Error checking auth:', error);
        window.location.href = 'login.html';
    }
}

// ============================================
// LOAD DISTRICTS FROM DATABASE
// ============================================
async function loadDistricts() {
    try {
        const { data: districts, error } = await sb
            .from('districts')
            .select('name, region:regions(name)')
            .order('name');
            
        if (error) throw error;
        
        const select = document.getElementById('deliveryDistrict');
        if (!select) return;
        
        let options = '<option value="">Select district</option>';
        
        if (districts && districts.length > 0) {
            // Group by region
            const grouped = {};
            districts.forEach(d => {
                const region = d.region?.name || 'Other';
                if (!grouped[region]) grouped[region] = [];
                grouped[region].push(d.name);
            });
            
            Object.keys(grouped).sort().forEach(region => {
                options += `<optgroup label="${region}">`;
                grouped[region].sort().forEach(district => {
                    options += `<option value="${district}">${district}</option>`;
                });
                options += '</optgroup>';
            });
        } else {
            // Fallback hardcoded districts
            const ugandaRegions = [
                { region: 'Central', districts: ['Kampala', 'Wakiso', 'Mukono', 'Masaka', 'Entebbe'] },
                { region: 'Western', districts: ['Mbarara', 'Kasese', 'Kabale', 'Fort Portal', 'Bushenyi'] },
                { region: 'Eastern', districts: ['Jinja', 'Mbale', 'Tororo', 'Soroti', 'Gulu'] },
                { region: 'Northern', districts: ['Lira', 'Arua', 'Kitgum', 'Nebbi', 'Moroto'] }
            ];
            
            ugandaRegions.forEach(region => {
                options += `<optgroup label="${region.region}">`;
                region.districts.forEach(district => {
                    options += `<option value="${district}">${district}</option>`;
                });
                options += '</optgroup>';
            });
        }
        
        select.innerHTML = options;
        
    } catch (error) {
        console.error('Error loading districts:', error);
        // Fallback to hardcoded districts
        const select = document.getElementById('deliveryDistrict');
        if (select) {
            select.innerHTML = `
                <option value="">Select district</option>
                <optgroup label="Central">
                    <option value="Kampala">Kampala</option>
                    <option value="Wakiso">Wakiso</option>
                    <option value="Mukono">Mukono</option>
                </optgroup>
                <optgroup label="Western">
                    <option value="Mbarara">Mbarara</option>
                    <option value="Kasese">Kasese</option>
                </optgroup>
                <optgroup label="Eastern">
                    <option value="Jinja">Jinja</option>
                    <option value="Mbale">Mbale</option>
                </optgroup>
                <optgroup label="Northern">
                    <option value="Gulu">Gulu</option>
                    <option value="Lira">Lira</option>
                </optgroup>
            `;
        }
    }
}

// ============================================
// LOAD SUPPLIERS
// ============================================
async function loadSuppliers() {
    const container = document.getElementById('suppliersList');
    if (!container) return;

    container.innerHTML = '<div class="loading-spinner"></div>';

    try {
        const { data: suppliers, error } = await sb
            .from('suppliers')
            .select(`
                id,
                business_name,
                verification_status,
                profiles!suppliers_profile_id_fkey (
                    avatar_url,
                    location,
                    phone,
                    email
                )
            `)
            .eq('verification_status', 'verified')
            .order('business_name')
            .limit(20);

        if (error) throw error;

        availableSuppliers = suppliers || [];

        if (!suppliers || suppliers.length === 0) {
            container.innerHTML = '<p class="text-muted">No suppliers found. You can add manually below.</p>';
            return;
        }

        container.innerHTML = suppliers.map(supplier => {
            const name = supplier.business_name || 'Supplier';
            const initials = name.split(' ')
                .map(n => n[0])
                .join('')
                .substring(0, 2)
                .toUpperCase();

            const profile = supplier.profiles || {};

            return `
                <div class="supplier-item" data-supplier-id="${supplier.id}">
                    <div class="supplier-avatar">
                        ${profile.avatar_url
                            ? `<img src="${profile.avatar_url}" alt="${escapeHtml(name)}">`
                            : initials
                        }
                    </div>
                    <div class="supplier-info">
                        <div class="supplier-name">${escapeHtml(name)}</div>
                        <div class="supplier-meta">
                            <span>
                                <i class="fas fa-map-marker-alt"></i>
                                ${escapeHtml(profile.location || 'Uganda')}
                            </span>
                            ${supplier.verification_status === 'verified'
                                ? '<span class="verified-badge"><i class="fas fa-check-circle"></i> Verified</span>'
                                : ''
                            }
                        </div>
                    </div>
                    <div class="supplier-radio"></div>
                </div>
            `;
        }).join('');

        // Add click listeners
        document.querySelectorAll('.supplier-item').forEach(item => {
            item.addEventListener('click', function() {
                const supplierId = this.dataset.supplierId;
                selectSupplier(supplierId);
            });
        });

    } catch (error) {
        console.error('Error loading suppliers:', error);
        container.innerHTML = '<p class="error-message">Failed to load suppliers</p>';
    }
}

// ============================================
// LOAD PRODUCTS
// ============================================
async function loadProducts() {
    try {
        const { data: products, error } = await sb
            .from('ads')
            .select(`
                id,
                title,
                price,
                wholesale_price,
                currency,
                image_urls,
                sku,
                moq
            `)
            .eq('status', 'active')
            .not('wholesale_price', 'is', null)
            .order('created_at', { ascending: false })
            .limit(50);
            
        if (error) throw error;
        
        availableProducts = products || [];
        renderProducts(availableProducts);
        
    } catch (error) {
        console.error('Error loading products:', error);
    }
}

// ============================================
// RENDER FUNCTIONS
// ============================================
function renderProducts(products) {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    
    if (products.length === 0) {
        grid.innerHTML = '<p class="text-muted">No products found</p>';
        return;
    }
    
    grid.innerHTML = products.map(product => {
        const inCart = cart.some(item => item.id === product.id);
        const imageUrl = product.image_urls?.[0] || 'https://via.placeholder.com/200?text=Product';
        const price = product.wholesale_price || product.price || 0;
        
        return `
            <div class="product-card ${inCart ? 'in-cart' : ''}" data-product-id="${product.id}">
                <div class="product-image">
                    <img src="${imageUrl}" alt="${escapeHtml(product.title)}" 
                         onerror="this.src='https://via.placeholder.com/200?text=Product'">
                </div>
                <div class="product-info">
                    <div class="product-title">${escapeHtml(product.title)}</div>
                    <div class="product-price">UGX ${formatNumber(price)}</div>
                    ${product.sku ? `<div class="product-sku">SKU: ${product.sku}</div>` : ''}
                </div>
                <button class="add-to-cart-btn ${inCart ? 'in-cart' : ''}" 
                        onclick="addToCart('${product.id}')">
                    ${inCart ? '<i class="fas fa-check"></i> Added' : 'Add to Order'}
                </button>
            </div>
        `;
    }).join('');
}

function renderCart() {
    const cartSection = document.getElementById('cartSection');
    const cartItems = document.getElementById('cartItems');
    const cartCount = document.getElementById('cartCount');
    const cartSubtotal = document.getElementById('cartSubtotal');
    
    if (!cartSection || !cartItems) return;
    
    if (cart.length === 0) {
        cartSection.style.display = 'none';
        return;
    }
    
    cartSection.style.display = 'block';
    cartCount.textContent = cart.length;
    
    let subtotal = 0;
    
    cartItems.innerHTML = cart.map((item, index) => {
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;
        
        return `
            <div class="cart-item" data-cart-index="${index}">
                <div class="cart-item-image">
                    <img src="${item.image}" alt="${escapeHtml(item.title)}">
                </div>
                <div class="cart-item-details">
                    <div class="cart-item-title">${escapeHtml(item.title)}</div>
                    <div class="cart-item-price">UGX ${formatNumber(item.price)} each</div>
                </div>
                <div class="cart-item-quantity">
                    <button class="qty-btn" onclick="updateCartItemQuantity(${index}, -1)">-</button>
                    <input type="number" class="qty-input" value="${item.quantity}" min="1" 
                           onchange="setCartItemQuantity(${index}, this.value)">
                    <button class="qty-btn" onclick="updateCartItemQuantity(${index}, 1)">+</button>
                </div>
                <div class="cart-item-remove" onclick="removeFromCart(${index})">
                    <i class="fas fa-trash-alt"></i>
                </div>
            </div>
        `;
    }).join('');
    
    cartSubtotal.textContent = `UGX ${formatNumber(subtotal)}`;
    
    validateStep2();
}

function renderSelectedSupplier() {
    const container = document.getElementById('selectedSupplier');
    const card = document.getElementById('selectedSupplierCard');
    
    if (!selectedSupplier) {
        if (container) container.style.display = 'none';
        return;
    }
    
    if (container) container.style.display = 'block';
    
    if (isManualSupplier) {
        card.innerHTML = `
            <div class="supplier-details">
                <h4>${escapeHtml(selectedSupplier.business_name)}</h4>
                <p><i class="fas fa-user"></i> ${escapeHtml(selectedSupplier.contact_person || '')}</p>
                <p><i class="fas fa-phone"></i> ${escapeHtml(selectedSupplier.phone)}</p>
                ${selectedSupplier.email ? `<p><i class="fas fa-envelope"></i> ${escapeHtml(selectedSupplier.email)}</p>` : ''}
                ${selectedSupplier.address ? `<p><i class="fas fa-map-marker-alt"></i> ${escapeHtml(selectedSupplier.address)}</p>` : ''}
                <p><small>Manual entry • Not verified</small></p>
            </div>
        `;
    } else {
        const name = selectedSupplier.business_name || 'Supplier';
        const profile = selectedSupplier.profiles || {};
        
        card.innerHTML = `
            <div class="supplier-details">
                <h4>${escapeHtml(name)}</h4>
                <p><i class="fas fa-map-marker-alt"></i> ${escapeHtml(profile.location || 'Uganda')}</p>
                <p><i class="fas fa-phone"></i> ${escapeHtml(profile.phone || '')}</p>
                ${profile.email ? `<p><i class="fas fa-envelope"></i> ${escapeHtml(profile.email)}</p>` : ''}
                ${selectedSupplier.verification_status === 'verified' ? 
                    '<p><span class="verified-badge"><i class="fas fa-check-circle"></i> Verified Supplier</span></p>' : 
                    ''}
            </div>
        `;
    }
}

function renderPOSummary() {
    const container = document.getElementById('poSummary');
    if (!container) return;
    
    const today = new Date();
    
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const vat = subtotal * 0.18;
    const total = subtotal + vat;
    
    const deliveryAddress = poData.deliveryAddress || currentUserProfile?.location || '';
    const deliveryDistrict = poData.deliveryDistrict || '';
    const fullAddress = deliveryAddress + (deliveryDistrict ? `, ${deliveryDistrict}` : '');
    
    container.innerHTML = `
        <div class="summary-header">
            <h3>PURCHASE ORDER</h3>
            <span class="summary-date">${formatDate(today)}</span>
        </div>
        
        <div class="summary-party">
            <div class="party-box">
                <h4>Buyer</h4>
                <div class="party-content">
                    <strong>${escapeHtml(currentUserProfile?.business_name || currentUserProfile?.full_name || 'Buyer')}</strong>
                    ${currentUserProfile?.location ? `<p><i class="fas fa-map-marker-alt"></i> ${escapeHtml(currentUserProfile.location)}</p>` : ''}
                    ${currentUserProfile?.phone ? `<p><i class="fas fa-phone"></i> ${escapeHtml(currentUserProfile.phone)}</p>` : ''}
                    <p><i class="fas fa-envelope"></i> ${escapeHtml(currentUser.email)}</p>
                </div>
            </div>
            <div class="party-box">
                <h4>Supplier</h4>
                <div class="party-content">
                    ${selectedSupplier ? `
                        <strong>${escapeHtml(isManualSupplier ? selectedSupplier.business_name : selectedSupplier.business_name)}</strong>
                        ${isManualSupplier ? `
                            <p><i class="fas fa-phone"></i> ${escapeHtml(selectedSupplier.phone)}</p>
                            ${selectedSupplier.email ? `<p><i class="fas fa-envelope"></i> ${escapeHtml(selectedSupplier.email)}</p>` : ''}
                            ${selectedSupplier.address ? `<p><i class="fas fa-map-marker-alt"></i> ${escapeHtml(selectedSupplier.address)}</p>` : ''}
                        ` : `
                            ${selectedSupplier.profiles?.location ? `<p><i class="fas fa-map-marker-alt"></i> ${escapeHtml(selectedSupplier.profiles.location)}</p>` : ''}
                            ${selectedSupplier.profiles?.phone ? `<p><i class="fas fa-phone"></i> ${escapeHtml(selectedSupplier.profiles.phone)}</p>` : ''}
                        `}
                    ` : '<p>No supplier selected</p>'}
                </div>
            </div>
        </div>
        
        <div class="summary-items">
            <h4>Order Items</h4>
            <table class="items-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Qty</th>
                        <th>Unit Price</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${cart.map(item => `
                        <tr>
                            <td>${escapeHtml(item.title)}</td>
                            <td>${item.quantity}</td>
                            <td>UGX ${formatNumber(item.price)}</td>
                            <td>UGX ${formatNumber(item.price * item.quantity)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <div class="summary-totals">
            <div class="total-row">
                <span>Subtotal:</span>
                <span>UGX ${formatNumber(subtotal)}</span>
            </div>
            <div class="total-row">
                <span>VAT (18%):</span>
                <span>UGX ${formatNumber(vat)}</span>
            </div>
            <div class="total-row grand-total">
                <span>TOTAL:</span>
                <span>UGX ${formatNumber(total)}</span>
            </div>
        </div>
        
        <div class="summary-terms">
            <p><strong>Payment Terms:</strong> ${formatPaymentTerms(poData.paymentTerms)}</p>
            <p><strong>Payment Method:</strong> ${formatPaymentMethod(poData.paymentMethod)}</p>
            <p><strong>Delivery Terms:</strong> ${formatDeliveryTerms(poData.deliveryTerms)}</p>
            <p><strong>Delivery Address:</strong> ${fullAddress || 'Not specified'}</p>
            ${poData.expectedDelivery ? `<p><strong>Expected Delivery:</strong> ${formatDate(poData.expectedDelivery)}</p>` : ''}
            ${poData.internalReference ? `<p><strong>Your Reference:</strong> ${escapeHtml(poData.internalReference)}</p>` : ''}
            ${poData.supplierNotes ? `<p><strong>Notes:</strong> ${escapeHtml(poData.supplierNotes)}</p>` : ''}
        </div>
    `;
}

// ============================================
// STEP NAVIGATION
// ============================================
function updateStep(step) {
    currentStep = step;
    
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
    
    for (let i = 1; i <= 4; i++) {
        const content = document.getElementById(`step${i}`);
        if (content) {
            content.classList.toggle('active', i === step);
        }
    }
    
    if (step === 4) {
        renderPOSummary();
        validateStep4();
    }
}

// ============================================
// SUPPLIER SELECTION
// ============================================
function selectSupplier(supplierId) {
    const supplier = availableSuppliers.find(s => s.id === supplierId);
    if (!supplier) return;
    
    selectedSupplier = supplier;
    isManualSupplier = false;
    
    document.querySelectorAll('.supplier-item').forEach(item => {
        const id = item.dataset.supplierId;
        item.classList.toggle('selected', id === supplierId);
    });
    
    renderSelectedSupplier();
    validateStep1();
    
    const manualForm = document.getElementById('manualSupplierForm');
    if (manualForm) manualForm.style.display = 'none';
}

async function selectSupplierById(supplierId) {
    const { data: supplier } = await sb
        .from('suppliers')
        .select(`
            *,
            profiles!suppliers_profile_id_fkey (
                avatar_url,
                location,
                phone,
                email
            )
        `)
        .eq('id', supplierId)
        .single();
        
    if (supplier) {
        selectedSupplier = supplier;
        isManualSupplier = false;
        renderSelectedSupplier();
        validateStep1();
        
        if (currentStep === 1) {
            document.querySelectorAll('.supplier-item').forEach(item => {
                const id = item.dataset.supplierId;
                item.classList.toggle('selected', id === supplierId);
            });
        }
    }
}

function saveManualSupplier() {
    const businessName = document.getElementById('manualBusinessName')?.value;
    const phone = document.getElementById('manualPhone')?.value;
    
    if (!businessName || !phone) {
        showToast('Please fill in required fields');
        return;
    }
    
    selectedSupplier = {
        business_name: businessName,
        contact_person: document.getElementById('manualContactPerson')?.value,
        phone: phone,
        email: document.getElementById('manualEmail')?.value,
        address: document.getElementById('manualAddress')?.value,
        tin: document.getElementById('manualTin')?.value
    };
    
    isManualSupplier = true;
    
    renderSelectedSupplier();
    validateStep1();
    
    document.getElementById('manualSupplierForm').style.display = 'none';
}

// ============================================
// CART FUNCTIONS
// ============================================
function addToCart(productId) {
    const product = availableProducts.find(p => p.id === productId);
    if (!product) return;
    
    const existingIndex = cart.findIndex(item => item.id === productId);
    
    if (existingIndex >= 0) {
        cart.splice(existingIndex, 1);
    } else {
        cart.push({
            id: product.id,
            title: product.title,
            price: product.wholesale_price || product.price,
            image: product.image_urls?.[0] || 'https://via.placeholder.com/50',
            quantity: product.moq || 1,
            sku: product.sku
        });
    }
    
    renderProducts(availableProducts);
    renderCart();
    validateStep2();
}

function updateCartItemQuantity(index, delta) {
    if (index < 0 || index >= cart.length) return;
    
    const newQty = cart[index].quantity + delta;
    if (newQty < 1) return;
    
    cart[index].quantity = newQty;
    renderCart();
    validateStep2();
}

function setCartItemQuantity(index, value) {
    if (index < 0 || index >= cart.length) return;
    
    const newQty = parseInt(value);
    if (isNaN(newQty) || newQty < 1) return;
    
    cart[index].quantity = newQty;
    renderCart();
    validateStep2();
}

function removeFromCart(index) {
    if (index < 0 || index >= cart.length) return;
    
    cart.splice(index, 1);
    
    renderProducts(availableProducts);
    renderCart();
    validateStep2();
}

function clearCart() {
    if (cart.length === 0) return;
    
    if (confirm('Clear all items from your order?')) {
        cart = [];
        renderProducts(availableProducts);
        renderCart();
        validateStep2();
    }
}

// ============================================
// VALIDATION FUNCTIONS
// ============================================
function validateStep1() {
    const continueBtn = document.getElementById('continueToStep2');
    if (continueBtn) continueBtn.disabled = !selectedSupplier;
}

function validateStep2() {
    const continueBtn = document.getElementById('continueToStep3');
    if (continueBtn) continueBtn.disabled = cart.length === 0;
}

function validateStep3() {
    const continueBtn = document.getElementById('continueToStep4');
    
    poData.paymentMethod = document.getElementById('paymentMethod')?.value || '';
    poData.deliveryTerms = document.getElementById('deliveryTerms')?.value || '';
    poData.deliveryAddress = document.getElementById('deliveryAddress')?.value || '';
    
    const isValid = poData.paymentMethod && poData.deliveryTerms && poData.deliveryAddress;
    
    if (continueBtn) continueBtn.disabled = !isValid;
}

function validateStep4() {
    const submitBtn = document.getElementById('submitPO');
    const terms1 = document.getElementById('acceptTerms');
    const terms2 = document.getElementById('acceptTerms2');
    
    if (submitBtn) {
        submitBtn.disabled = !(terms1?.checked && terms2?.checked);
    }
}

// ============================================
// SUBMIT PURCHASE ORDER - WITH COLUMN CHECK
// ============================================
async function submitPurchaseOrder() {
    const submitBtn = document.getElementById('submitPO');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating PO...';
    }
    
    try {
        if (!selectedSupplier) throw new Error('No supplier selected');
        if (cart.length === 0) throw new Error('No items in order');
        
        const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const vat = subtotal * 0.18;
        const total = subtotal + vat;
        
        const poNumber = 'PO-' + new Date().getFullYear() + '-' + 
                        String(Math.floor(Math.random() * 10000)).padStart(4, '0');
        
        let supplierId = selectedSupplier.id;
        
        if (isManualSupplier) {
            const { data: newSupplier, error: supplierError } = await sb
                .from('suppliers')
                .insert({
                    business_name: selectedSupplier.business_name,
                    business_phone: selectedSupplier.phone,
                    business_email: selectedSupplier.email,
                    verification_status: 'pending'
                })
                .select()
                .single();
                
            if (supplierError) throw supplierError;
            supplierId = newSupplier.id;
        }
        
        // Build order data dynamically to handle missing columns
        const orderData = {
            order_number: poNumber,
            buyer_id: currentUser.id,
            supplier_id: supplierId,
            status: 'pending',
            subtotal: subtotal,
            total_amount: total,
            currency: 'UGX',
            payment_status: 'pending',
            payment_method: poData.paymentMethod,
            payment_terms: [poData.paymentTerms],
            delivery_terms: [poData.deliveryTerms],
            delivery_address: poData.deliveryAddress,
            created_at: new Date().toISOString(),
            placed_at: new Date().toISOString()
        };
        
        // Add optional fields only if they have values
        if (poData.deliveryDistrict) orderData.delivery_district = poData.deliveryDistrict;
        if (poData.deliveryPhone) orderData.delivery_contact_phone = poData.deliveryPhone;
        if (poData.internalReference) orderData.internal_reference = poData.internalReference;
        if (poData.supplierNotes) orderData.supplier_notes = poData.supplierNotes;
        if (vat > 0) orderData.tax_amount = vat;
        
        console.log('Submitting order with data:', orderData);
        
        const { data: order, error: orderError } = await sb
            .from('orders')
            .insert(orderData)
            .select()
            .single();
            
        if (orderError) {
            console.error('Order error details:', orderError);
            throw orderError;
        }
        
        const orderItems = cart.map(item => ({
            order_id: order.id,
            ad_id: item.id,
            product_title: item.title,
            quantity: item.quantity,
            unit_price: item.price,
            total_price: item.price * item.quantity,
            status: 'pending'
        }));
        
        const { error: itemsError } = await sb
            .from('order_items')
            .insert(orderItems);
            
        if (itemsError) throw itemsError;
        
        // Add initial delivery tracking
        await sb
            .from('delivery_tracking')
            .insert({
                order_id: order.id,
                status: 'pending',
                location: 'Warehouse',
                description: 'Order placed - awaiting processing',
                created_at: new Date().toISOString()
            });
        
        if (uploadedFiles.length > 0) {
            for (const file of uploadedFiles) {
                const filePath = `orders/${order.id}/${Date.now()}_${file.name}`;
                
                const { error: uploadError } = await sb
                    .storage
                    .from('order-attachments')
                    .upload(filePath, file);
                    
                if (uploadError) throw uploadError;
            }
        }
        
        if (!isManualSupplier && supplierId) {
            await sb
                .from('notifications')
                .insert({
                    user_id: supplierId,
                    type: 'order_received',
                    title: 'New Order Received',
                    message: `You've received a purchase order #${poNumber}`,
                    link: `/supplier-order.html?id=${order.id}`,
                    ad_id: null
                });
        }
        
        const poNumberDisplay = document.getElementById('poNumberDisplay');
        const viewPOBtn = document.getElementById('viewPOBtn');
        const successMessage = document.getElementById('successMessage');
        const successModal = document.getElementById('successModal');
        
        if (poNumberDisplay) poNumberDisplay.textContent = poNumber;
        if (viewPOBtn) viewPOBtn.href = `purchase-order.html?id=${order.id}`;
        if (successMessage) successMessage.textContent = 'Your purchase order has been created and sent to the supplier.';
        if (successModal) successModal.classList.add('show');
        
    } catch (error) {
        console.error('Error creating purchase order:', error);
        showToast(error.message || 'Failed to create purchase order');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Purchase Order';
        }
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return num.toLocaleString('en-UG');
}

function formatDate(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-UG', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch (e) {
        return 'Invalid date';
    }
}

function formatPaymentTerms(term) {
    const terms = {
        'advance_full': '100% Advance',
        'advance_partial': '50% Advance, 50% on Delivery',
        'credit_7': '7 Days Net',
        'credit_15': '15 Days Net',
        'credit_30': '30 Days Net',
        'negotiable': 'Negotiable'
    };
    return terms[term] || term || 'Not specified';
}

function formatPaymentMethod(method) {
    const methods = {
        'bank_transfer': 'Bank Transfer',
        'mobile_money': 'Mobile Money',
        'cash_on_delivery': 'Cash on Delivery',
        'cheque': 'Cheque'
    };
    return methods[method] || method || 'Not specified';
}

function formatDeliveryTerms(term) {
    const terms = {
        'ex_warehouse': 'Ex-Warehouse',
        'fob': 'FOB (Free on Board)',
        'cif': 'CIF (Cost, Insurance, Freight)',
        'door_delivery': 'Door Delivery',
        'pickup': 'Buyer Pickup',
        'dap': 'Delivered at Place'
    };
    return terms[term] || term || 'Not specified';
}

function setMinDeliveryDate() {
    const input = document.getElementById('expectedDelivery');
    if (input) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        input.min = tomorrow.toISOString().split('T')[0];
    }
}

function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function collectStep3Data() {
    poData = {
        paymentMethod: document.getElementById('paymentMethod')?.value || '',
        paymentTerms: document.getElementById('paymentTerms')?.value || 'advance_full',
        mobileMoneyNumber: document.getElementById('mobileMoneyNumber')?.value || '',
        mobileMoneyNetwork: document.getElementById('mobileMoneyNetwork')?.value || 'mtn',
        bankName: document.getElementById('bankName')?.value || '',
        accountNumber: document.getElementById('accountNumber')?.value || '',
        deliveryTerms: document.getElementById('deliveryTerms')?.value || 'door_delivery',
        expectedDelivery: document.getElementById('expectedDelivery')?.value || '',
        deliveryAddress: document.getElementById('deliveryAddress')?.value || '',
        deliveryDistrict: document.getElementById('deliveryDistrict')?.value || '',
        deliveryPhone: document.getElementById('deliveryPhone')?.value || '',
        internalReference: document.getElementById('internalReference')?.value || '',
        supplierNotes: document.getElementById('supplierNotes')?.value || ''
    };
}

// ============================================
// FILE UPLOAD FUNCTIONS
// ============================================
function setupFileUpload() {
    const uploadArea = document.getElementById('fileUploadArea');
    const fileInput = document.getElementById('fileInput');
    
    if (!uploadArea || !fileInput) return;
    
    uploadArea.addEventListener('click', () => fileInput.click());
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--primary)';
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = 'var(--gray-300)';
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--gray-300)';
        
        const files = Array.from(e.dataTransfer.files);
        handleFiles(files);
    });
    
    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        handleFiles(files);
    });
}

function handleFiles(files) {
    const maxSize = 10 * 1024 * 1024;
    
    files.forEach(file => {
        if (file.size > maxSize) {
            showToast(`File ${file.name} exceeds 10MB`);
            return;
        }
        uploadedFiles.push(file);
    });
    
    renderFileList();
}

function renderFileList() {
    const fileList = document.getElementById('fileList');
    if (!fileList) return;
    
    if (uploadedFiles.length === 0) {
        fileList.innerHTML = '';
        return;
    }
    
    fileList.innerHTML = uploadedFiles.map((file, index) => `
        <div class="file-item">
            <i class="fas fa-file"></i>
            <span class="file-name">${file.name}</span>
            <span class="file-size">${(file.size / 1024).toFixed(1)} KB</span>
            <i class="fas fa-times remove-file" onclick="removeFile(${index})"></i>
        </div>
    `).join('');
}

function removeFile(index) {
    uploadedFiles.splice(index, 1);
    renderFileList();
}

// ============================================
// MODAL FUNCTIONS
// ============================================
function closeSuccessModal() {
    const modal = document.getElementById('successModal');
    if (modal) modal.classList.remove('show');
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Step navigation
    document.getElementById('continueToStep2')?.addEventListener('click', () => updateStep(2));
    document.getElementById('continueToStep3')?.addEventListener('click', () => {
        collectStep3Data();
        updateStep(3);
    });
    document.getElementById('continueToStep4')?.addEventListener('click', () => {
        collectStep3Data();
        updateStep(4);
    });
    
    document.getElementById('backToStep1')?.addEventListener('click', () => updateStep(1));
    document.getElementById('backToStep2')?.addEventListener('click', () => updateStep(2));
    document.getElementById('backToStep3')?.addEventListener('click', () => updateStep(3));
    
    // Manual supplier toggle
    document.getElementById('showManualSupplier')?.addEventListener('click', () => {
        const form = document.getElementById('manualSupplierForm');
        if (form) {
            form.style.display = form.style.display === 'none' ? 'block' : 'none';
        }
    });
    
    document.getElementById('cancelManualSupplier')?.addEventListener('click', () => {
        document.getElementById('manualSupplierForm').style.display = 'none';
    });
    
    document.getElementById('saveManualSupplier')?.addEventListener('click', saveManualSupplier);
    
    // Payment method toggle
    document.getElementById('paymentMethod')?.addEventListener('change', (e) => {
        const mobileFields = document.getElementById('mobileMoneyFields');
        const bankFields = document.getElementById('bankFields');
        
        if (mobileFields) mobileFields.style.display = e.target.value === 'mobile_money' ? 'block' : 'none';
        if (bankFields) bankFields.style.display = e.target.value === 'bank_transfer' ? 'block' : 'none';
        
        validateStep3();
    });
    
    // Form validation
    document.getElementById('paymentMethod')?.addEventListener('change', validateStep3);
    document.getElementById('deliveryTerms')?.addEventListener('change', validateStep3);
    document.getElementById('deliveryAddress')?.addEventListener('input', validateStep3);
    
    // Terms checkboxes
    document.getElementById('acceptTerms')?.addEventListener('change', validateStep4);
    document.getElementById('acceptTerms2')?.addEventListener('change', validateStep4);
    
    // Submit
    document.getElementById('submitPO')?.addEventListener('click', submitPurchaseOrder);
    
    // Clear cart
    document.getElementById('clearCartBtn')?.addEventListener('click', clearCart);
    
    // Product search
    document.getElementById('productSearch')?.addEventListener('input', (e) => {
        const search = e.target.value.toLowerCase();
        const filtered = availableProducts.filter(p => 
            p.title.toLowerCase().includes(search) || 
            (p.sku && p.sku.toLowerCase().includes(search))
        );
        renderProducts(filtered);
    });
    
    // SKU quick add
    document.getElementById('addBySkuBtn')?.addEventListener('click', () => {
        const sku = document.getElementById('skuInput')?.value;
        if (!sku) return;
        
        const product = availableProducts.find(p => p.sku && p.sku.toLowerCase() === sku.toLowerCase());
        if (product) {
            addToCart(product.id);
            document.getElementById('skuInput').value = '';
        } else {
            showToast('Product not found');
        }
    });
    
    // File upload
    setupFileUpload();
}

// Make functions available globally
window.addToCart = addToCart;
window.updateCartItemQuantity = updateCartItemQuantity;
window.setCartItemQuantity = setCartItemQuantity;
window.removeFromCart = removeFromCart;
window.clearCart = clearCart;
window.closeSuccessModal = closeSuccessModal;
window.removeFile = removeFile;
window.selectSupplier = selectSupplier;