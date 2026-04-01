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
let inquiry = null;
let quotations = [];
let filteredQuotations = [];
let selectedQuotes = new Set();
let currentView = 'table';
let currentFilter = 'all';

// Get inquiry ID from URL
const urlParams = new URLSearchParams(window.location.search);
const inquiryId = urlParams.get('id');

// ============================================
// INITIALIZATION
//============================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    if (!inquiryId) {
        showToast('No inquiry ID provided');
        setTimeout(() => window.location.href = 'my-inquiries.html', 2000);
        return;
    }
    await loadData();
    setupEventListeners();
    setupRealtimeSubscription();
});

// ============================================
// AUTHENTICATION
// ============================================
async function checkAuth() {
    try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) {
            window.location.href = 'login.html?redirect=compare-quotes.html?id=' + inquiryId;
            return;
        }
        currentUser = user;
    } catch (error) {
        console.error('Error checking auth:', error);
        window.location.href = 'login.html';
    }
}

// ============================================
// LOAD DATA
// ============================================
async function loadData() {
    showLoading(true);
    
    try {
        // Load inquiry details
        const { data: inquiryData, error: inquiryError } = await sb
            .from('inquiry_requests')
            .select(`
                *,
                inquiry_items (*)
            `)
            .eq('id', inquiryId)
            .eq('buyer_id', currentUser.id)
            .single();
            
        if (inquiryError) throw inquiryError;
        
        if (!inquiryData) {
            showToast('Inquiry not found');
            setTimeout(() => window.location.href = 'my-inquiries.html', 2000);
            return;
        }
        
        inquiry = inquiryData;
        
        // Load quotations
        const { data: quotes, error: quotesError } = await sb
            .from('supplier_quotes')
            .select(`
                *,
                suppliers!inner (
                    id,
                    business_name,
                    verification_status,
                    profiles!suppliers_profile_id_fkey (
                        avatar_url,
                        location,
                        full_name
                    )
                ),
                supplier_quote_items (*)
            `)
            .eq('inquiry_id', inquiryId)
            .in('status', ['sent', 'accepted'])
            .order('total_amount', { ascending: true });
            
        if (quotesError) throw quotesError;
        
        quotations = quotes || [];
        filteredQuotations = [...quotations];
        
        if (quotations.length < 2) {
            document.getElementById('comparisonContent').style.display = 'none';
            document.getElementById('emptyState').style.display = 'block';
            return;
        }
        
        // Update UI
        updateSummaryCards();
        renderInquiryRef();
        renderComparisonTable();
        renderComparisonCards();
        renderRecommendation();
        
        document.getElementById('comparisonContent').style.display = 'block';
        
    } catch (error) {
        console.error('Error loading data:', error);
        showToast('Failed to load quotations');
    } finally {
        showLoading(false);
    }
}

// ============================================
// RENDERING FUNCTIONS
// ============================================
function updateSummaryCards() {
    const container = document.getElementById('summaryCards');
    
    const lowestPrice = Math.min(...quotations.map(q => q.total_amount));
    const highestPrice = Math.max(...quotations.map(q => q.total_amount));
    const avgPrice = quotations.reduce((sum, q) => sum + q.total_amount, 0) / quotations.length;
    const fastestDelivery = Math.min(...quotations.map(q => q.lead_time_days || 30));
    
    container.innerHTML = `
        <div class="summary-card">
            <span class="summary-value">UGX ${formatNumber(lowestPrice)}</span>
            <span class="summary-label">Lowest Price</span>
        </div>
        <div class="summary-card">
            <span class="summary-value">UGX ${formatNumber(Math.round(avgPrice))}</span>
            <span class="summary-label">Average Price</span>
        </div>
        <div class="summary-card">
            <span class="summary-value">${fastestDelivery} days</span>
            <span class="summary-label">Fastest Delivery</span>
        </div>
        <div class="summary-card">
            <span class="summary-value">${quotations.length}</span>
            <span class="summary-label">Total Quotes</span>
        </div>
    `;
}

function renderInquiryRef() {
    document.getElementById('inquiryRef').textContent = 
        `${inquiry.inquiry_number || 'Inquiry'} • ${inquiry.inquiry_items?.length || 0} products`;
}

function renderComparisonTable() {
    const header = document.getElementById('tableHeader');
    const body = document.getElementById('tableBody');
    
    // Render header
    header.innerHTML = `
        <tr>
            <th style="width: 200px;">Products & Terms</th>
            ${filteredQuotations.map((quote, index) => {
                const supplier = quote.suppliers;
                const supplierName = supplier.business_name || supplier.profiles?.full_name || 'Supplier';
                const avatarInitial = supplierName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                const isSelected = selectedQuotes.has(quote.id);
                
                return `
                    <th>
                        <div class="supplier-info">
                            <div class="supplier-avatar">
                                ${supplier.profiles?.avatar_url ? 
                                    `<img src="${supplier.profiles.avatar_url}" alt="${supplierName}">` : 
                                    avatarInitial
                                }
                            </div>
                            <div>
                                <div class="supplier-name">
                                    ${escapeHtml(supplierName)}
                                    ${supplier.verification_status === 'verified' ? 
                                        '<i class="fas fa-check-circle verified-badge"></i>' : ''}
                                </div>
                                <div class="supplier-rating">
                                    <i class="fas fa-star"></i>
                                    <i class="fas fa-star"></i>
                                    <i class="fas fa-star"></i>
                                    <i class="fas fa-star"></i>
                                    <i class="fas fa-star-half-alt"></i>
                                </div>
                            </div>
                        </div>
                        <div class="select-checkbox">
                            <input type="checkbox" 
                                   class="quote-select" 
                                   data-quote-id="${quote.id}"
                                   ${isSelected ? 'checked' : ''}
                                   onchange="toggleQuoteSelection(${quote.id})">
                        </div>
                    </th>
                `;
            }).join('')}
        </tr>
    `;
    
    // Get all unique products
    const allProducts = new Map();
    filteredQuotations.forEach(quote => {
        quote.supplier_quote_items?.forEach(item => {
            if (!allProducts.has(item.product_name)) {
                allProducts.set(item.product_name, {
                    name: item.product_name,
                    requestedQty: inquiry.inquiry_items?.find(i => i.product_name === item.product_name)?.quantity || 0
                });
            }
        });
    });
    
    const products = Array.from(allProducts.values());
    
    // Render product rows
    let rows = '';
    
    products.forEach(product => {
        rows += '<tr>';
        rows += `<td class="product-name">${escapeHtml(product.name)}</td>`;
        
        filteredQuotations.forEach(quote => {
            const item = quote.supplier_quote_items?.find(i => i.product_name === product.name);
            const allPrices = filteredQuotations.map(q => {
                const i = q.supplier_quote_items?.find(it => it.product_name === product.name);
                return i ? i.unit_price : Infinity;
            });
            const minPrice = Math.min(...allPrices);
            
            rows += `<td class="price-cell ${item && item.unit_price === minPrice ? 'highlight' : ''}">`;
            if (item) {
                rows += `UGX ${formatNumber(item.unit_price)}`;
                if (product.requestedQty) {
                    rows += `<br><small>Requested: ${product.requestedQty}</small>`;
                }
            } else {
                rows += '—';
            }
            rows += '</td>';
        });
        
        rows += '</tr>';
    });
    
    // Add total row
    rows += '<tr class="total-row">';
    rows += '<td><strong>Total Amount</strong></td>';
    
    filteredQuotations.forEach(quote => {
        const allTotals = filteredQuotations.map(q => q.total_amount);
        const minTotal = Math.min(...allTotals);
        
        rows += `<td class="price-cell ${quote.total_amount === minTotal ? 'highlight' : ''}">
                    <strong>UGX ${formatNumber(quote.total_amount)}</strong>
                </td>`;
    });
    
    rows += '</tr>';
    
    // Add payment terms row
    rows += '<tr>';
    rows += '<td>Payment Terms</td>';
    
    filteredQuotations.forEach(quote => {
        rows += `<td class="terms-cell">${formatPaymentTerms(quote.payment_terms?.[0])}</td>`;
    });
    
    rows += '</tr>';
    
    // Add delivery terms row
    rows += '<tr>';
    rows += '<td>Delivery Terms</td>';
    
    filteredQuotations.forEach(quote => {
        rows += `<td class="terms-cell">${formatDeliveryTerms(quote.delivery_terms?.[0])}</td>`;
    });
    
    rows += '</tr>';
    
    // Add lead time row
    rows += '<tr>';
    rows += '<td>Lead Time</td>';
    
    filteredQuotations.forEach(quote => {
        rows += `<td class="terms-cell">${quote.lead_time_days ? quote.lead_time_days + ' days' : 'Not specified'}</td>`;
    });
    
    rows += '</tr>';
    
    // Add validity row
    rows += '<tr>';
    rows += '<td>Valid Until</td>';
    
    filteredQuotations.forEach(quote => {
        rows += `<td class="terms-cell ${checkIfExpiring(quote.valid_until) ? 'expiring' : ''}">
                    ${formatDate(quote.valid_until)}
                </td>`;
    });
    
    rows += '</tr>';
    
    // Add action row
    rows += '<tr>';
    rows += '<td>Action</td>';
    
    filteredQuotations.forEach(quote => {
        rows += `<td class="action-cell">
                    <button class="btn-select ${selectedQuotes.has(quote.id) ? 'selected' : ''}" 
                            onclick="toggleQuoteSelection(${quote.id})">
                        <i class="fas ${selectedQuotes.has(quote.id) ? 'fa-check-circle' : 'fa-circle'}"></i>
                        ${selectedQuotes.has(quote.id) ? 'Selected' : 'Select'}
                    </button>
                </td>`;
    });
    
    rows += '</tr>';
    
    body.innerHTML = rows;
}

function renderComparisonCards() {
    const container = document.getElementById('cardsGrid');
    
    container.innerHTML = filteredQuotations.map(quote => {
        const supplier = quote.suppliers;
        const supplierName = supplier.business_name || supplier.profiles?.full_name || 'Supplier';
        const avatarInitial = supplierName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const items = quote.supplier_quote_items || [];
        const isSelected = selectedQuotes.has(quote.id);
        const isExpiring = checkIfExpiring(quote.valid_until);
        const isRecommended = isRecommendedQuote(quote);
        
        return `
            <div class="comparison-card ${isSelected ? 'selected' : ''}" data-quote-id="${quote.id}">
                ${isRecommended ? '<div class="card-badge recommended">Best Value</div>' : ''}
                ${quote.status === 'accepted' ? '<div class="card-badge">Accepted</div>' : ''}
                
                <div class="card-header">
                    <div class="card-avatar">
                        ${supplier.profiles?.avatar_url ? 
                            `<img src="${supplier.profiles.avatar_url}" alt="${supplierName}">` : 
                            avatarInitial
                        }
                    </div>
                    <div class="card-supplier-info">
                        <div class="card-supplier-name">
                            ${escapeHtml(supplierName)}
                            ${supplier.verification_status === 'verified' ? 
                                '<i class="fas fa-check-circle card-verified"></i>' : ''}
                        </div>
                        <div class="card-supplier-rating">
                            <i class="fas fa-star"></i>
                            <i class="fas fa-star"></i>
                            <i class="fas fa-star"></i>
                            <i class="fas fa-star"></i>
                            <i class="fas fa-star-half-alt"></i>
                        </div>
                    </div>
                </div>
                
                <div class="card-amount">
                    <span class="amount-number">UGX ${formatNumber(quote.total_amount)}</span>
                    <span class="amount-label">total</span>
                </div>
                
                <div class="card-items">
                    <h4>Items (${items.length})</h4>
                    <ul class="items-list">
                        ${items.slice(0, 3).map(item => `
                            <li>
                                <span class="item-name">${escapeHtml(item.product_name || 'Item')}</span>
                                <span class="item-qty">x${item.quantity}</span>
                                <span class="item-price">UGX ${formatNumber(item.unit_price)}</span>
                            </li>
                        `).join('')}
                        ${items.length > 3 ? `
                            <li>
                                <span class="item-name">+${items.length - 3} more items</span>
                            </li>
                        ` : ''}
                    </ul>
                </div>
                
                <div class="card-terms">
                    <div class="term-row">
                        <span class="term-label">Payment:</span>
                        <span class="term-value">${formatPaymentTerms(quote.payment_terms?.[0])}</span>
                    </div>
                    <div class="term-row">
                        <span class="term-label">Delivery:</span>
                        <span class="term-value">${formatDeliveryTerms(quote.delivery_terms?.[0])}</span>
                    </div>
                    <div class="term-row">
                        <span class="term-label">Lead Time:</span>
                        <span class="term-value">${quote.lead_time_days ? quote.lead_time_days + ' days' : 'N/A'}</span>
                    </div>
                </div>
                
                <div class="card-validity ${isExpiring ? 'expiring' : ''}">
                    <i class="fas fa-clock"></i>
                    <span>Valid until ${formatDate(quote.valid_until)}</span>
                </div>
                
                <div class="card-actions">
                    <button class="btn-sm secondary" onclick="viewQuoteDetails(${quote.id})">
                        <i class="fas fa-eye"></i> View
                    </button>
                    <button class="btn-sm ${isSelected ? 'primary' : 'secondary'}" 
                            onclick="toggleQuoteSelection(${quote.id})">
                        <i class="fas ${isSelected ? 'fa-check-circle' : 'fa-circle'}"></i>
                        ${isSelected ? 'Selected' : 'Select'}
                    </button>
                    ${quote.status === 'sent' ? `
                        <button class="btn-sm accept" onclick="showAcceptQuote(${quote.id})">
                            <i class="fas fa-check"></i> Accept
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function renderRecommendation() {
    const container = document.getElementById('recommendationCard');
    const bestQuote = findBestValueQuote();
    
    if (!bestQuote) {
        container.style.display = 'none';
        return;
    }
    
    const supplier = bestQuote.suppliers;
    const supplierName = supplier.business_name || supplier.profiles?.full_name || 'Supplier';
    const avgPrice = quotations.reduce((sum, q) => sum + q.total_amount, 0) / quotations.length;
    const savings = avgPrice - bestQuote.total_amount;
    
    container.innerHTML = `
        <div class="recommendation-badge">
            <i class="fas fa-star"></i> BEST VALUE
        </div>
        <div class="recommendation-info">
            <h4>${escapeHtml(supplierName)}</h4>
            <p>${supplier.verification_status === 'verified' ? '✓ Verified Supplier' : 'Registered Supplier'}</p>
        </div>
        <div class="recommendation-price">
            <span class="price">UGX ${formatNumber(bestQuote.total_amount)}</span>
            ${savings > 0 ? `
                <span class="savings">Save UGX ${formatNumber(Math.round(savings))} vs average</span>
            ` : ''}
        </div>
        <div class="recommendation-actions">
            <button class="btn-sm primary" onclick="viewQuoteDetails(${bestQuote.id})">
                View Details
            </button>
            <button class="btn-sm accept" onclick="showAcceptQuote(${bestQuote.id})">
                Accept Quote
            </button>
        </div>
    `;
}

// ============================================
// QUOTE ACTIONS
// ============================================
window.toggleQuoteSelection = function(quoteId) {
    if (selectedQuotes.has(quoteId)) {
        selectedQuotes.delete(quoteId);
    } else {
        selectedQuotes.add(quoteId);
    }
    
    updateSelectionUI();
    updateActionBar();
};

window.selectAllQuotes = function() {
    filteredQuotations.forEach(quote => {
        selectedQuotes.add(quote.id);
    });
    updateSelectionUI();
    updateActionBar();
};

window.clearSelection = function() {
    selectedQuotes.clear();
    updateSelectionUI();
    updateActionBar();
};

function updateSelectionUI() {
    // Update table checkboxes
    document.querySelectorAll('.quote-select').forEach(checkbox => {
        const quoteId = parseInt(checkbox.dataset.quoteId);
        checkbox.checked = selectedQuotes.has(quoteId);
    });
    
    // Update table select buttons
    document.querySelectorAll('.btn-select').forEach(btn => {
        const quoteId = parseInt(btn.getAttribute('onclick')?.match(/\d+/)?.[0]);
        if (quoteId && selectedQuotes.has(quoteId)) {
            btn.classList.add('selected');
            btn.innerHTML = '<i class="fas fa-check-circle"></i> Selected';
        } else if (quoteId) {
            btn.classList.remove('selected');
            btn.innerHTML = '<i class="fas fa-circle"></i> Select';
        }
    });
    
    // Update cards
    document.querySelectorAll('.comparison-card').forEach(card => {
        const quoteId = parseInt(card.dataset.quoteId);
        if (quoteId && selectedQuotes.has(quoteId)) {
            card.classList.add('selected');
        } else if (quoteId) {
            card.classList.remove('selected');
        }
    });
    
    // Update card buttons
    document.querySelectorAll('.comparison-card .btn-sm').forEach(btn => {
        const onclick = btn.getAttribute('onclick');
        if (onclick?.includes('toggleQuoteSelection')) {
            const quoteId = parseInt(onclick.match(/\d+/)?.[0]);
            if (quoteId && selectedQuotes.has(quoteId)) {
                btn.classList.add('primary');
                btn.classList.remove('secondary');
                btn.innerHTML = '<i class="fas fa-check-circle"></i> Selected';
            } else if (quoteId) {
                btn.classList.remove('primary');
                btn.classList.add('secondary');
                btn.innerHTML = '<i class="fas fa-circle"></i> Select';
            }
        }
    });
}

function updateActionBar() {
    const count = selectedQuotes.size;
    document.querySelector('#selectedCount span').textContent = count;
    
    const compareBtn = document.getElementById('compareSelectedBtn');
    const acceptBtn = document.getElementById('acceptSelectedBtn');
    
    compareBtn.disabled = count < 2;
    acceptBtn.disabled = count === 0;
}

window.viewQuoteDetails = function(quoteId) {
    const quote = quotations.find(q => q.id === quoteId);
    if (!quote) return;
    
    renderQuoteDetailsModal(quote);
    document.getElementById('quoteModal').classList.add('show');
};

function renderQuoteDetailsModal(quote) {
    const modalBody = document.getElementById('quoteModalBody');
    const supplier = quote.suppliers;
    const supplierName = supplier.business_name || supplier.profiles?.full_name || 'Supplier';
    const avatarInitial = supplierName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const items = quote.supplier_quote_items || [];
    
    const html = `
        <div class="quote-detail-header">
            <div class="quote-detail-number">${quote.quote_number || 'Quote'}</div>
            <div class="quote-detail-date">Issued on ${formatDate(quote.created_at)}</div>
        </div>
        
        <div class="supplier-detail-card">
            <div class="supplier-detail-avatar">
                ${supplier.profiles?.avatar_url ? 
                    `<img src="${supplier.profiles.avatar_url}" alt="${supplierName}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">` : 
                    avatarInitial
                }
            </div>
            <div class="supplier-detail-info">
                <h4>${escapeHtml(supplierName)}</h4>
                <p><i class="fas fa-map-marker-alt"></i> ${escapeHtml(supplier.profiles?.location || 'Uganda')}</p>
                <p><i class="fas fa-check-circle" style="color: var(--secondary);"></i> 
                    ${supplier.verification_status === 'verified' ? 'Verified Supplier' : 'Registration Pending'}</p>
            </div>
        </div>
        
        <table class="quote-items-full">
            <thead>
                <tr>
                    <th>Product</th>
                    <th>Quantity</th>
                    <th>Unit Price</th>
                    <th>Total</th>
                </tr>
            </thead>
            <tbody>
                ${items.map(item => `
                    <tr>
                        <td>${escapeHtml(item.product_name || 'Product')}</td>
                        <td>${item.quantity}</td>
                        <td>UGX ${formatNumber(item.unit_price)}</td>
                        <td>UGX ${formatNumber(item.total_price)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        
        <div class="quote-total-row">
            <span class="quote-total-label">Total Amount:</span>
            <span class="quote-total-value">UGX ${formatNumber(quote.total_amount)}</span>
        </div>
        
        <div style="margin-top: 20px;">
            <p><strong>Payment Terms:</strong> ${formatPaymentTerms(quote.payment_terms?.[0])}</p>
            <p><strong>Delivery Terms:</strong> ${formatDeliveryTerms(quote.delivery_terms?.[0])}</p>
            <p><strong>Valid Until:</strong> ${formatDate(quote.valid_until)}</p>
            ${quote.lead_time_days ? `<p><strong>Lead Time:</strong> ${quote.lead_time_days} days</p>` : ''}
        </div>
        
        ${quote.notes ? `
            <div style="margin-top: 16px; padding: 12px; background: var(--gray-100); border-radius: var(--radius-sm);">
                <strong>Additional Notes:</strong>
                <p style="margin-top: 4px;">${escapeHtml(quote.notes)}</p>
            </div>
        ` : ''}
        
        <div class="modal-actions" style="margin-top: 20px;">
            ${quote.status === 'sent' ? `
                <button class="btn-confirm" onclick="showAcceptQuote(${quote.id})">
                    <i class="fas fa-check"></i> Accept This Quote
                </button>
            ` : ''}
            <button class="btn-cancel" onclick="closeQuoteModal()">Close</button>
        </div>
    `;
    
    modalBody.innerHTML = html;
}

window.showAcceptQuote = function(quoteId) {
    const quote = quotations.find(q => q.id === quoteId);
    if (!quote) return;
    
    renderAcceptModal(quote);
    document.getElementById('acceptModal').classList.add('show');
};

function renderAcceptModal(quote) {
    const modalBody = document.getElementById('acceptModalBody');
    const supplier = quote.suppliers;
    const supplierName = supplier.business_name || supplier.profiles?.full_name || 'Supplier';
    
    const html = `
        <p>You are about to accept the quotation from <strong>${escapeHtml(supplierName)}</strong></p>
        
        <div class="selected-quote-summary">
            <h4>Quote Summary</h4>
            <div class="summary-row">
                <span class="summary-label">Quote Number:</span>
                <span class="summary-value">${quote.quote_number || 'N/A'}</span>
            </div>
            <div class="summary-row">
                <span class="summary-label">Total Amount:</span>
                <span class="summary-value">UGX ${formatNumber(quote.total_amount)}</span>
            </div>
            <div class="summary-row">
                <span class="summary-label">Payment Terms:</span>
                <span class="summary-value">${formatPaymentTerms(quote.payment_terms?.[0])}</span>
            </div>
            <div class="summary-row">
                <span class="summary-label">Delivery Terms:</span>
                <span class="summary-value">${formatDeliveryTerms(quote.delivery_terms?.[0])}</span>
            </div>
            <div class="summary-row">
                <span class="summary-label">Valid Until:</span>
                <span class="summary-value">${formatDate(quote.valid_until)}</span>
            </div>
        </div>
        
        <div class="terms-checkbox">
            <input type="checkbox" id="acceptTerms">
            <label for="acceptTerms">I confirm that I want to accept this quotation and proceed to create a purchase order</label>
        </div>
        
        <div class="modal-actions">
            <button class="btn-confirm" id="confirmAcceptBtn" disabled>Confirm & Create Order</button>
            <button class="btn-cancel" onclick="closeAcceptModal()">Cancel</button>
        </div>
    `;
    
    modalBody.innerHTML = html;
    
    document.getElementById('acceptTerms')?.addEventListener('change', (e) => {
        document.getElementById('confirmAcceptBtn').disabled = !e.target.checked;
    });
    
    document.getElementById('confirmAcceptBtn')?.addEventListener('click', () => {
        acceptQuote(quote.id);
    });
}

async function acceptQuote(quoteId) {
    try {
        const quote = quotations.find(q => q.id === quoteId);
        if (!quote) throw new Error('Quote not found');
        
        // Update quote status
        const { error: updateError } = await sb
            .from('supplier_quotes')
            .update({ status: 'accepted' })
            .eq('id', quoteId);
            
        if (updateError) throw updateError;
        
        // Reject all other quotes for this inquiry
        await sb
            .from('supplier_quotes')
            .update({ status: 'rejected' })
            .eq('inquiry_id', inquiryId)
            .neq('id', quoteId)
            .eq('status', 'sent');
        
        // Create purchase order
        const orderNumber = 'PO-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        
        const { data: order, error: orderError } = await sb
            .from('orders')
            .insert({
                order_number: orderNumber,
                buyer_id: currentUser.id,
                supplier_id: quote.supplier_id,
                status: 'pending',
                subtotal: quote.total_amount,
                total_amount: quote.total_amount,
                currency: 'UGX',
                payment_status: 'pending',
                original_quote_id: quoteId,
                inquiry_id: inquiryId,
                created_at: new Date().toISOString()
            })
            .select()
            .single();
            
        if (orderError) throw orderError;
        
        // Create order items from quote items
        if (quote.supplier_quote_items && quote.supplier_quote_items.length > 0) {
            const orderItems = quote.supplier_quote_items.map(item => ({
                order_id: order.id,
                ad_id: item.product_id,
                product_title: item.product_name,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total_price: item.total_price,
                status: 'pending'
            }));
            
            await sb
                .from('order_items')
                .insert(orderItems);
        }
        
        // Update inquiry status
        await sb
            .from('inquiry_requests')
            .update({ status: 'ordered' })
            .eq('id', inquiryId);
        
        // Create notification for supplier
        await sb
            .from('notifications')
            .insert({
                user_id: quote.supplier_id,
                type: 'order_received',
                title: 'Order Received',
                message: `Your quotation has been accepted and order #${orderNumber} has been created`,
                link: `/supplier-order.html?id=${order.id}`,
                ad_id: null
            });
        
        // Close modals
        closeAcceptModal();
        closeQuoteModal();
        
        // Show success
        document.getElementById('successMessage').textContent = 
            'Quote accepted successfully! Your order has been created.';
        document.getElementById('successModal').classList.add('show');
        
        // Refresh data
        await loadData();
        
    } catch (error) {
        console.error('Error accepting quote:', error);
        showToast('Failed to accept quote');
    }
}

// ============================================
// COMPARISON FUNCTIONS
// ============================================
function findBestValueQuote() {
    if (quotations.length === 0) return null;
    
    // Simple algorithm: lowest price with verified status bonus
    return quotations.reduce((best, current) => {
        let bestScore = best.total_amount;
        let currentScore = current.total_amount;
        
        // Bonus for verified suppliers
        if (best.suppliers?.verification_status === 'verified') bestScore *= 0.95;
        if (current.suppliers?.verification_status === 'verified') currentScore *= 0.95;
        
        // Bonus for faster delivery
        if (best.lead_time_days) bestScore *= (1 + (best.lead_time_days / 100));
        if (current.lead_time_days) currentScore *= (1 + (current.lead_time_days / 100));
        
        return currentScore < bestScore ? current : best;
    });
}

function isRecommendedQuote(quote) {
    const best = findBestValueQuote();
    return best && best.id === quote.id;
}

// ============================================
// FILTER FUNCTIONS
// ============================================
function applyFilter(filter) {
    currentFilter = filter;
    
    switch(filter) {
        case 'lowest':
            filteredQuotations = [...quotations].sort((a, b) => a.total_amount - b.total_amount);
            break;
        case 'fastest':
            filteredQuotations = [...quotations].sort((a, b) => 
                (a.lead_time_days || 999) - (b.lead_time_days || 999)
            );
            break;
        case 'verified':
            filteredQuotations = quotations.filter(q => q.suppliers?.verification_status === 'verified');
            break;
        default:
            filteredQuotations = [...quotations];
    }
    
    renderComparisonTable();
    renderComparisonCards();
    updateActionBar();
}

// ============================================
// VIEW FUNCTIONS
// ============================================
function switchView(view) {
    currentView = view;
    
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.view === view) {
            btn.classList.add('active');
        }
    });
    
    document.getElementById('tableView').classList.toggle('active', view === 'table');
    document.getElementById('cardView').classList.toggle('active', view === 'card');
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function showLoading(show) {
    const loadingEl = document.getElementById('loadingState');
    const contentEl = document.getElementById('comparisonContent');
    
    if (!loadingEl || !contentEl) return;
    
    if (show) {
        loadingEl.style.display = 'block';
        contentEl.style.display = 'none';
    } else {
        loadingEl.style.display = 'none';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    if (!dateString) return 'Not set';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-UG', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch (e) {
        return 'Invalid date';
    }
}

function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    try {
        return num.toLocaleString('en-UG');
    } catch (e) {
        return num.toString();
    }
}

function formatPaymentTerms(term) {
    const terms = {
        'advance_full': '100% Advance',
        'advance_partial': '50% Advance, 50% on Delivery',
        'credit_7': '7 Days Credit',
        'credit_15': '15 Days Credit',
        'credit_30': '30 Days Credit',
        'negotiable': 'Negotiable'
    };
    return terms[term] || term || 'Not specified';
}

function formatDeliveryTerms(term) {
    const terms = {
        'ex_warehouse': 'Ex-Warehouse',
        'fob': 'FOB (Free on Board)',
        'cif': 'CIF (Cost, Insurance, Freight)',
        'door_delivery': 'Door Delivery',
        'pickup': 'Buyer Pickup'
    };
    return terms[term] || term || 'Not specified';
}

function checkIfExpiring(expiryDate) {
    if (!expiryDate) return false;
    const expiry = new Date(expiryDate);
    const now = new Date();
    const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    return diffDays <= 3;
}

function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyFilter(btn.dataset.filter);
        });
    });
    
    // View buttons
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchView(btn.dataset.view);
        });
    });
    
    // Compare selected button
    document.getElementById('compareSelectedBtn')?.addEventListener('click', () => {
        if (selectedQuotes.size >= 2) {
            // Filter to show only selected quotes
            filteredQuotations = quotations.filter(q => selectedQuotes.has(q.id));
            renderComparisonTable();
            renderComparisonCards();
        }
    });
    
    // Accept selected button
    document.getElementById('acceptSelectedBtn')?.addEventListener('click', () => {
        if (selectedQuotes.size === 1) {
            const quoteId = Array.from(selectedQuotes)[0];
            showAcceptQuote(quoteId);
        } else if (selectedQuotes.size > 1) {
            showToast('Please select only one quote to accept');
        }
    });
    
    // Close modals
    document.querySelectorAll('.modal-close, .modal').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target === el || e.target.classList.contains('modal-close')) {
                closeQuoteModal();
                closeAcceptModal();
                closeSuccessModal();
            }
        });
    });
}

// ============================================
// MODAL MANAGEMENT
// ============================================
window.closeQuoteModal = function() {
    document.getElementById('quoteModal').classList.remove('show');
};

window.closeAcceptModal = function() {
    document.getElementById('acceptModal').classList.remove('show');
};

window.closeSuccessModal = function() {
    document.getElementById('successModal').classList.remove('show');
};

// ============================================
// REALTIME SUBSCRIPTIONS
// ============================================
function setupRealtimeSubscription() {
    // Listen for quote updates
    const quoteSubscription = sb
        .channel('quote-updates-' + inquiryId)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'supplier_quotes',
                filter: `inquiry_id=eq.${inquiryId}`
            },
            async () => {
                await loadData();
            }
        )
        .subscribe();
}

// ============================================
// EXPORT FUNCTIONS FOR GLOBAL SCOPE
// ============================================
window.toggleQuoteSelection = toggleQuoteSelection;
window.selectAllQuotes = selectAllQuotes;
window.clearSelection = clearSelection;
window.viewQuoteDetails = viewQuoteDetails;
window.showAcceptQuote = showAcceptQuote;
window.closeQuoteModal = closeQuoteModal;
window.closeAcceptModal = closeAcceptModal;
window.closeSuccessModal = closeSuccessModal;