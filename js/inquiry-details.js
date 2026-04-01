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
let selectedQuote = null;
let comparisonQuotes = [];

// Get inquiry ID from URL
const urlParams = new URLSearchParams(window.location.search);
const inquiryId = urlParams.get('id');

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    if (!inquiryId) {
        showToast('No inquiry ID provided');
        setTimeout(() => window.location.href = 'my-inquiries.html', 2000);
        return;
    }
    await loadInquiryDetails();
    setupEventListeners();
    setupRealtimeSubscription();
});

// ============================================
// AUTHENTICATION
//============================================
async function checkAuth() {
    try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) {
            window.location.href = 'login.html?redirect=inquiry-details.html?id=' + inquiryId;
            return;
        }
        currentUser = user;
    } catch (error) {
        console.error('Error checking auth:', error);
        window.location.href = 'login.html';
    }
}

// ============================================
// LOAD INQUIRY DETAILS
// ============================================
async function loadInquiryDetails() {
    showLoading(true);
    
    try {
        // Load inquiry with all related data
        const { data: inquiryData, error: inquiryError } = await sb
            .from('inquiry_requests')
            .select(`
                *,
                inquiry_items (*),
                rfq_attachments (*),
                inquiry_supplier_matches (
                    supplier_id,
                    has_quoted,
                    suppliers!inner (
                        id,
                        business_name,
                        verification_status,
                        profiles!suppliers_profile_id_fkey (
                            avatar_url,
                            location
                        )
                    )
                )
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
        
        // Load quotations for this inquiry
        await loadQuotations();
        
        // Render all sections
        renderInquiryDetails();
        renderTimeline();
        renderProducts();
        renderTerms();
        renderAttachments();
        renderQuotations();
        
        // Show the details
        document.getElementById('inquiryDetails').style.display = 'block';
        
    } catch (error) {
        console.error('Error loading inquiry details:', error);
        showToast('Failed to load inquiry details');
    } finally {
        showLoading(false);
    }
}

async function loadQuotations() {
    try {
        const { data: quotes, error } = await sb
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
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        quotations = quotes || [];
        
    } catch (error) {
        console.error('Error loading quotations:', error);
        quotations = [];
    }
}

// ============================================
// RENDERING FUNCTIONS
// ============================================
function renderInquiryDetails() {
    // Basic info
    document.getElementById('inquiryTitle').textContent = inquiry.title || 'Untitled Inquiry';
    document.getElementById('inquiryNumber').textContent = inquiry.inquiry_number || 'No number';
    
    // Status
    const status = determineStatus();
    const statusBadge = document.getElementById('inquiryStatus');
    statusBadge.textContent = formatStatus(status);
    statusBadge.className = `status-badge ${status}`;
    
    // Dates
    document.getElementById('createdDate').textContent = formatDate(inquiry.created_at);
    document.getElementById('expiryDate').textContent = formatDate(inquiry.expires_at);
    document.getElementById('expectedDelivery').textContent = formatDate(inquiry.expected_delivery_date) || 'Not specified';
    
    // Time remaining
    const timeRemaining = getTimeRemaining(inquiry.expires_at);
    document.getElementById('timeRemaining').textContent = timeRemaining;
    if (timeRemaining.includes('Expiring') || timeRemaining.includes('Expires today')) {
        document.getElementById('timeRemaining').style.color = 'var(--danger)';
    }
    
    // Location
    const location = inquiry.shipping_district ? 
        `${inquiry.shipping_address ? inquiry.shipping_address + ', ' : ''}${inquiry.shipping_district}` : 
        'Not specified';
    document.getElementById('deliveryLocation').textContent = location;
    
    // Show/hide edit button based on status
    if (status === 'pending' || status === 'expired') {
        document.getElementById('editInquiryBtn').style.display = 'flex';
    }
}

function renderTimeline() {
    const timeline = document.getElementById('timeline');
    const status = determineStatus();
    
    const steps = [
        { label: 'Sent', date: inquiry.created_at, completed: true },
        { label: 'Quotes Received', date: quotations.length > 0 ? quotations[0]?.created_at : null, completed: quotations.length > 0 },
        { label: 'Quote Accepted', date: quotations.find(q => q.status === 'accepted')?.created_at, completed: status === 'accepted' },
        { label: 'Order Placed', date: null, completed: status === 'accepted' }
    ];
    
    timeline.innerHTML = steps.map((step, index) => {
        let stepClass = '';
        if (step.completed) {
            stepClass = 'completed';
        } else if (index === steps.findIndex(s => !s.completed)) {
            stepClass = 'active';
        }
        
        return `
            <div class="timeline-item ${stepClass}">
                <div class="timeline-marker">
                    ${step.completed ? '<i class="fas fa-check"></i>' : (index + 1)}
                </div>
                <div class="timeline-label">${step.label}</div>
                <div class="timeline-date">${step.date ? formatDate(step.date) : ''}</div>
            </div>
        `;
    }).join('');
}

function renderProducts() {
    const tbody = document.getElementById('productsTableBody');
    const items = inquiry.inquiry_items || [];
    
    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">No products added</td></tr>';
        return;
    }
    
    tbody.innerHTML = items.map(item => `
        <tr>
            <td class="product-name">${escapeHtml(item.product_name || 'Product')}</td>
            <td class="product-quantity">${item.quantity || 0}</td>
            <td class="product-price">${item.preferred_unit_price ? 'UGX ' + formatNumber(item.preferred_unit_price) : 'Not specified'}</td>
            <td class="product-notes">${escapeHtml(item.notes || item.specifications?.notes || '')}</td>
        </tr>
    `).join('');
}

function renderTerms() {
    document.getElementById('paymentTerms').textContent = formatPaymentTerms(inquiry.payment_terms?.[0]);
    document.getElementById('deliveryTerms').textContent = formatDeliveryTerms(inquiry.delivery_terms?.[0]);
    
    const address = inquiry.shipping_address ? 
        `${inquiry.shipping_address}, ${inquiry.shipping_district || ''}`.replace(/, $/, '') : 
        'Not specified';
    document.getElementById('shippingAddress').textContent = address;
    
    if (inquiry.description) {
        document.getElementById('notesSection').style.display = 'block';
        document.getElementById('inquiryNotes').textContent = inquiry.description;
    }
}

function renderAttachments() {
    const attachments = inquiry.rfq_attachments || [];
    
    if (attachments.length === 0) {
        return;
    }
    
    document.getElementById('attachmentsSection').style.display = 'block';
    const container = document.getElementById('attachmentsList');
    
    container.innerHTML = attachments.map(att => `
        <a href="${att.file_url}" target="_blank" class="attachment-item">
            <i class="fas ${getFileIcon(att.file_name)}"></i>
            <span class="attachment-name">${att.file_name}</span>
            <span class="attachment-size">${formatFileSize(att.file_size)}</span>
        </a>
    `).join('');
}

function renderQuotations() {
    const container = document.getElementById('quotationsList');
    const noQuotes = document.getElementById('noQuotes');
    const quoteCount = document.getElementById('quoteCount');
    const comparisonToggle = document.getElementById('comparisonToggle');
    
    quoteCount.textContent = `${quotations.length} quotation${quotations.length !== 1 ? 's' : ''}`;
    
    if (quotations.length === 0) {
        container.innerHTML = '';
        noQuotes.style.display = 'block';
        comparisonToggle.style.display = 'none';
        return;
    }
    
    noQuotes.style.display = 'none';
    
    if (quotations.length > 1) {
        comparisonToggle.style.display = 'block';
    }
    
    container.innerHTML = quotations.map(quote => renderQuoteCard(quote)).join('');
}

function renderQuoteCard(quote) {
    if (!quote || !quote.suppliers) return '';
    
    const supplier = quote.suppliers;
    const supplierName = supplier.business_name || supplier.profiles?.full_name || 'Supplier';
    const avatarInitial = supplierName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const items = quote.supplier_quote_items || [];
    const totalItems = items.length;
    const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const isExpiring = checkIfExpiring(quote.valid_until);
    const isAccepted = quote.status === 'accepted';
    
    return `
        <div class="quote-card ${isAccepted ? 'accepted' : ''}" data-quote-id="${quote.id}">
            <div class="quote-header">
                <div class="supplier-info">
                    <div class="supplier-avatar">
                        ${supplier.profiles?.avatar_url ? 
                            `<img src="${supplier.profiles.avatar_url}" alt="${supplierName}">` : 
                            avatarInitial
                        }
                    </div>
                    <div class="supplier-details">
                        <div class="supplier-name">${escapeHtml(supplierName)}</div>
                        <div class="supplier-meta">
                            <span class="supplier-rating">
                                <i class="fas fa-star"></i>
                                <i class="fas fa-star"></i>
                                <i class="fas fa-star"></i>
                                <i class="fas fa-star"></i>
                                <i class="fas fa-star-half-alt"></i>
                            </span>
                            <span>•</span>
                            <span>${supplier.verification_status === 'verified' ? 'Verified' : 'Pending'}</span>
                        </div>
                    </div>
                </div>
                <span class="quote-badge ${quote.status}">${quote.status === 'sent' ? 'Quote Received' : quote.status}</span>
            </div>
            
            <div class="quote-amount">
                <span class="amount-large">UGX ${formatNumber(quote.total_amount)}</span>
                <span class="amount-label">total amount</span>
            </div>
            
            <div class="quote-items-preview">
                <div class="preview-title">Items (${totalItems})</div>
                <div class="preview-grid">
                    ${items.slice(0, 3).map(item => `
                        <div class="preview-item">
                            <span class="item-name">${escapeHtml(item.product_name || 'Item')}</span>
                            <span class="item-qty">x${item.quantity}</span>
                        </div>
                    `).join('')}
                    ${items.length > 3 ? `
                        <div class="preview-item">
                            <span class="item-name">+${items.length - 3} more</span>
                        </div>
                    ` : ''}
                </div>
            </div>
            
            <div class="quote-footer">
                <div class="quote-validity ${isExpiring ? 'expiring' : ''}">
                    <i class="fas fa-clock"></i>
                    <span>Valid until ${formatDate(quote.valid_until)}</span>
                </div>
                <div class="quote-actions">
                    <button class="btn-sm secondary" onclick="viewQuoteDetails(${quote.id})">
                        <i class="fas fa-eye"></i> View
                    </button>
                    ${quote.status === 'sent' && !isAccepted ? `
                        <button class="btn-sm accept" onclick="showAcceptQuote(${quote.id})">
                            <i class="fas fa-check"></i> Accept
                        </button>
                    ` : ''}
                    ${isAccepted ? `
                        <span class="badge accepted">Accepted</span>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

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
                <p><i class="fas fa-check-circle" style="color: var(--secondary);"></i> ${supplier.verification_status === 'verified' ? 'Verified Supplier' : 'Registration Pending'}</p>
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
        
        <div class="quote-terms-grid">
            <div class="term-item">
                <span class="label">Payment Terms</span>
                <span class="value">${formatPaymentTerms(quote.payment_terms?.[0])}</span>
            </div>
            <div class="term-item">
                <span class="label">Delivery Terms</span>
                <span class="value">${formatDeliveryTerms(quote.delivery_terms?.[0])}</span>
            </div>
            <div class="term-item">
                <span class="label">Valid Until</span>
                <span class="value">${formatDate(quote.valid_until)}</span>
            </div>
            ${quote.lead_time_days ? `
                <div class="term-item">
                    <span class="label">Lead Time</span>
                    <span class="value">${quote.lead_time_days} days</span>
                </div>
            ` : ''}
        </div>
        
        ${quote.notes ? `
            <div class="quote-notes" style="margin-top: 16px; padding: 12px; background: var(--gray-100); border-radius: var(--radius-sm);">
                <strong>Additional Notes:</strong>
                <p style="margin-top: 4px; font-size: 13px;">${escapeHtml(quote.notes)}</p>
            </div>
        ` : ''}
        
        <div class="quote-actions" style="margin-top: 20px;">
            ${quote.status === 'sent' ? `
                <button class="btn-sm accept" style="flex: 1;" onclick="showAcceptQuote(${quote.id})">
                    <i class="fas fa-check"></i> Accept This Quote
                </button>
                <button class="btn-sm reject" style="flex: 1;" onclick="rejectQuote(${quote.id})">
                    <i class="fas fa-times"></i> Reject
                </button>
            ` : ''}
            <button class="btn-sm secondary" onclick="window.print()" style="flex: 1;">
                <i class="fas fa-print"></i> Print
            </button>
        </div>
    `;
    
    modalBody.innerHTML = html;
}

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
    
    // Enable confirm button when terms are checked
    document.getElementById('acceptTerms')?.addEventListener('change', (e) => {
        document.getElementById('confirmAcceptBtn').disabled = !e.target.checked;
    });
    
    // Add confirm handler
    document.getElementById('confirmAcceptBtn')?.addEventListener('click', () => {
        acceptQuote(quote.id);
    });
}

function renderComparisonModal() {
    const modalBody = document.getElementById('compareModalBody');
    
    if (quotations.length < 2) {
        modalBody.innerHTML = '<p>Need at least 2 quotes to compare</p>';
        return;
    }
    
    // Get all unique products across quotes
    const allProducts = new Map();
    quotations.forEach(quote => {
        quote.supplier_quote_items?.forEach(item => {
            if (!allProducts.has(item.product_name)) {
                allProducts.set(item.product_name, {
                    name: item.product_name,
                    quantities: []
                });
            }
        });
    });
    
    const products = Array.from(allProducts.values());
    
    let html = `
        <table class="comparison-table">
            <thead>
                <tr>
                    <th>Product</th>
                    ${quotations.map((quote, index) => `
                        <th class="${index === 0 ? 'supplier-col' : ''}">
                            ${escapeHtml(quote.suppliers?.business_name || `Supplier ${index + 1}`)}
                        </th>
                    `).join('')}
                </tr>
            </thead>
            <tbody>
    `;
    
    // Add product rows
    products.forEach(product => {
        html += '<tr>';
        html += `<td>${escapeHtml(product.name)}</td>`;
        
        quotations.forEach(quote => {
            const item = quote.supplier_quote_items?.find(i => i.product_name === product.name);
            html += `<td class="${item ? '' : 'text-muted'}">`;
            if (item) {
                html += `UGX ${formatNumber(item.unit_price)}<br>`;
                html += `<small>Qty: ${item.quantity}</small>`;
            } else {
                html += '—';
            }
            html += '</td>';
        });
        
        html += '</tr>';
    });
    
    // Add total row
    html += `
        <tr class="comparison-highlight">
            <td><strong>Total Amount</strong></td>
            ${quotations.map(quote => `
                <td><strong>UGX ${formatNumber(quote.total_amount)}</strong></td>
            `).join('')}
        </tr>
    `;
    
    // Add terms row
    html += `
        <tr>
            <td>Payment Terms</td>
            ${quotations.map(quote => `
                <td>${formatPaymentTerms(quote.payment_terms?.[0])}</td>
            `).join('')}
        </tr>
        <tr>
            <td>Delivery Terms</td>
            ${quotations.map(quote => `
                <td>${formatDeliveryTerms(quote.delivery_terms?.[0])}</td>
            `).join('')}
        </tr>
    `;
    
    html += `
            </tbody>
        </table>
        
        <div class="comparison-actions" style="margin-top: 20px; text-align: center;">
            <p style="margin-bottom: 12px; color: var(--gray-600);">Compare quotes and choose the best offer</p>
        </div>
    `;
    
    modalBody.innerHTML = html;
}

// ============================================
// QUOTE ACTIONS
// ============================================
window.viewQuoteDetails = function(quoteId) {
    const quote = quotations.find(q => q.id === quoteId);
    if (!quote) return;
    
    selectedQuote = quote;
    renderQuoteDetailsModal(quote);
    document.getElementById('quoteModal').classList.add('show');
};

window.showAcceptQuote = function(quoteId) {
    const quote = quotations.find(q => q.id === quoteId);
    if (!quote) return;
    
    selectedQuote = quote;
    renderAcceptModal(quote);
    document.getElementById('acceptModal').classList.add('show');
};

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
        await loadQuotations();
        renderQuotations();
        renderTimeline();
        
    } catch (error) {
        console.error('Error accepting quote:', error);
        showToast('Failed to accept quote');
    }
}

window.rejectQuote = async function(quoteId) {
    if (!confirm('Are you sure you want to reject this quotation?')) return;
    
    try {
        const { error } = await sb
            .from('supplier_quotes')
            .update({ status: 'rejected' })
            .eq('id', quoteId);
            
        if (error) throw error;
        
        showToast('Quote rejected');
        closeQuoteModal();
        await loadQuotations();
        renderQuotations();
        
    } catch (error) {
        console.error('Error rejecting quote:', error);
        showToast('Failed to reject quote');
    }
};

// ============================================
// COMPARISON FUNCTIONS
// ============================================
window.toggleComparison = function() {
    renderComparisonModal();
    document.getElementById('compareModal').classList.add('show');
};

// ============================================
// INQUIRY ACTIONS
// ============================================
window.resendToSuppliers = async function() {
    if (!confirm('Resend this inquiry to all matching suppliers?')) return;
    
    try {
        // Get all suppliers who haven't quoted yet
        const { data: matches, error } = await sb
            .from('inquiry_supplier_matches')
            .select('supplier_id')
            .eq('inquiry_id', inquiryId)
            .eq('has_quoted', false);
            
        if (error) throw error;
        
        if (!matches || matches.length === 0) {
            showToast('All suppliers have already responded');
            return;
        }
        
        // Create notifications for suppliers
        const notifications = matches.map(match => ({
            user_id: match.supplier_id,
            type: 'inquiry_reminder',
            title: 'Inquiry Reminder',
            message: `Reminder: You have a pending inquiry: ${inquiry.title}`,
            link: `/supplier-inquiry.html?id=${inquiryId}`,
            ad_id: null
        }));
        
        await sb
            .from('notifications')
            .insert(notifications);
        
        showToast(`Inquiry resent to ${matches.length} suppliers`);
        
    } catch (error) {
        console.error('Error resending inquiry:', error);
        showToast('Failed to resend inquiry');
    }
};

// ============================================
// UTILITY FUNCTIONS
// ============================================
function determineStatus() {
    if (!inquiry) return 'pending';
    
    // Check if expired
    if (inquiry.expires_at && new Date(inquiry.expires_at) < new Date()) {
        return 'expired';
    }
    
    // Check if any quote is accepted
    if (quotations.some(q => q.status === 'accepted' || q.status === 'converted')) {
        return 'accepted';
    }
    
    // Check if has quotes
    if (quotations.length > 0) {
        return 'quoted';
    }
    
    return 'pending';
}

function showLoading(show) {
    const loadingEl = document.getElementById('loadingState');
    const detailsEl = document.getElementById('inquiryDetails');
    
    if (!loadingEl || !detailsEl) return;
    
    if (show) {
        loadingEl.style.display = 'block';
        detailsEl.style.display = 'none';
    } else {
        loadingEl.style.display = 'none';
        detailsEl.style.display = 'block';
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

function formatStatus(status) {
    const statusMap = {
        'pending': 'Pending',
        'quoted': 'Quotes Received',
        'accepted': 'Accepted',
        'expired': 'Expired',
        'ordered': 'Order Placed'
    };
    return statusMap[status] || status;
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

function getTimeRemaining(expiryDate) {
    if (!expiryDate) return 'No expiry';
    
    const expiry = new Date(expiryDate);
    const now = new Date();
    
    if (expiry < now) return 'Expired';
    
    const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Expires today';
    if (diffDays === 1) return 'Expires tomorrow';
    return `${diffDays} days remaining`;
}

function getFileIcon(filename) {
    if (!filename) return 'fa-file';
    const ext = filename.split('.').pop().toLowerCase();
    
    const icons = {
        'pdf': 'fa-file-pdf',
        'doc': 'fa-file-word',
        'docx': 'fa-file-word',
        'xls': 'fa-file-excel',
        'xlsx': 'fa-file-excel',
        'jpg': 'fa-file-image',
        'jpeg': 'fa-file-image',
        'png': 'fa-file-image',
        'gif': 'fa-file-image'
    };
    
    return icons[ext] || 'fa-file';
}

function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
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
    // Edit button
    document.getElementById('editInquiryBtn')?.addEventListener('click', () => {
        window.location.href = `send-inquiry.html?edit=${inquiryId}`;
    });
    
    // Resend button
    document.getElementById('resendInquiryBtn')?.addEventListener('click', resendToSuppliers);
    
    // Close modals
    document.querySelectorAll('.modal-close, .modal').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target === el || e.target.classList.contains('modal-close')) {
                closeQuoteModal();
                closeAcceptModal();
                closeCompareModal();
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

window.closeCompareModal = function() {
    document.getElementById('compareModal').classList.remove('show');
};

window.closeSuccessModal = function() {
    document.getElementById('successModal').classList.remove('show');
};

// ============================================
// REALTIME SUBSCRIPTIONS
// ============================================
function setupRealtimeSubscription() {
    // Listen for new quotes
    const quoteSubscription = sb
        .channel('quote-changes-' + inquiryId)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'supplier_quotes',
                filter: `inquiry_id=eq.${inquiryId}`
            },
            async () => {
                showToast('New quotation received!');
                await loadQuotations();
                renderQuotations();
                renderTimeline();
                updateStats();
            }
        )
        .subscribe();
    
    // Listen for quote updates
    const quoteUpdateSubscription = sb
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
                await loadQuotations();
                renderQuotations();
                renderTimeline();
            }
        )
        .subscribe();
}

// ============================================
// EXPORT FUNCTIONS FOR GLOBAL SCOPE
// ============================================
window.viewQuoteDetails = viewQuoteDetails;
window.showAcceptQuote = showAcceptQuote;
window.rejectQuote = rejectQuote;
window.toggleComparison = toggleComparison;
window.resendToSuppliers = resendToSuppliers;
window.closeQuoteModal = closeQuoteModal;
window.closeAcceptModal = closeAcceptModal;
window.closeCompareModal = closeCompareModal;
window.closeSuccessModal = closeSuccessModal;