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
let quote = null;
let inquiry = null;
let otherQuotes = [];
let negotiationInProgress = false;

// Get quote ID from URL
const urlParams = new URLSearchParams(window.location.search);
const quoteId = urlParams.get('id');

// ============================================
// INITIALIZATION
//============================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    if (!quoteId) {
        showError('No quote ID provided');
        return;
    }
    await loadQuoteDetails();
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
            window.location.href = 'login.html?redirect=buyer-quote.html?id=' + quoteId;
            return;
        }
        currentUser = user;
    } catch (error) {
        console.error('Error checking auth:', error);
        window.location.href = 'login.html';
    }
}

// ============================================
// LOAD QUOTE DETAILS
// ============================================
async function loadQuoteDetails() {
    showLoading(true);
    
    try {
        // Load quote with all related data
        const { data: quoteData, error: quoteError } = await sb
            .from('supplier_quotes')
            .select(`
                *,
                suppliers!inner (
                    id,
                    business_name,
                    verification_status,
                    business_registration,
                    year_established,
                    response_time_hours,
                    completion_rate,
                    profiles!suppliers_profile_id_fkey (
                        avatar_url,
                        location,
                        phone,
                        email,
                        full_name
                    )
                ),
                supplier_quote_items (*),
                inquiry_requests!inner (
                    id,
                    inquiry_number,
                    title,
                    buyer_id,
                    inquiry_items (*)
                )
            `)
            .eq('id', quoteId)
            .single();
            
        if (quoteError) throw quoteError;
        
        // Verify this quote belongs to the current user
        if (quoteData.inquiry_requests.buyer_id !== currentUser.id) {
            showError('You do not have permission to view this quote');
            return;
        }
        
        quote = quoteData;
        inquiry = quote.inquiry_requests;
        
        // Load other quotes for this inquiry (for comparison)
        await loadOtherQuotes();
        
        // Render all sections
        renderStatusBar();
        renderQuoteHeader();
        renderSupplierCard();
        renderAmountSummary();
        renderItemsTable();
        renderTerms();
        renderNotes();
        renderAttachments();
        renderComparison();
        renderActionButtons();
        
        // Show the content
        document.getElementById('quoteContent').style.display = 'block';
        
    } catch (error) {
        console.error('Error loading quote details:', error);
        showError('Failed to load quote details');
    } finally {
        showLoading(false);
    }
}

async function loadOtherQuotes() {
    try {
        const { data: quotes, error } = await sb
            .from('supplier_quotes')
            .select(`
                id,
                quote_number,
                total_amount,
                status,
                valid_until,
                suppliers!inner (
                    id,
                    business_name,
                    profiles!suppliers_profile_id_fkey (
                        avatar_url
                    )
                )
            `)
            .eq('inquiry_id', inquiry.id)
            .neq('id', quoteId)
            .in('status', ['sent', 'accepted'])
            .order('total_amount', { ascending: true });
            
        if (error) throw error;
        
        otherQuotes = quotes || [];
        
    } catch (error) {
        console.error('Error loading other quotes:', error);
        otherQuotes = [];
    }
}

// ============================================
// RENDERING FUNCTIONS
// ============================================
function renderStatusBar() {
    const statusBar = document.getElementById('statusBar');
    const isExpiring = checkIfExpiring(quote.valid_until);
    const status = quote.status;
    
    let statusText = '';
    let statusClass = '';
    
    switch(status) {
        case 'sent':
            statusText = 'Quote Received';
            statusClass = 'sent';
            break;
        case 'accepted':
            statusText = 'Accepted';
            statusClass = 'accepted';
            break;
        case 'rejected':
            statusText = 'Rejected';
            statusClass = 'rejected';
            break;
        case 'expired':
            statusText = 'Expired';
            statusClass = 'expired';
            break;
        default:
            statusText = status;
            statusClass = status;
    }
    
    statusBar.innerHTML = `
        <span class="status-badge-large ${statusClass}">
            <i class="fas ${getStatusIcon(status)}"></i>
            ${statusText}
        </span>
        ${isExpiring && status === 'sent' ? `
            <span class="expiry-warning">
                <i class="fas fa-exclamation-triangle"></i>
                Expires in ${getDaysUntilExpiry(quote.valid_until)} days
            </span>
        ` : ''}
    `;
}

function renderQuoteHeader() {
    document.getElementById('quoteTitle').textContent = `Quote for: ${inquiry.title || 'Bulk Inquiry'}`;
    document.getElementById('quoteNumber').textContent = quote.quote_number || 'No number';
    document.getElementById('quoteDate').textContent = `Issued on ${formatDate(quote.created_at)}`;
}

function renderSupplierCard() {
    const supplier = quote.suppliers;
    const profile = supplier.profiles || {};
    const supplierName = supplier.business_name || profile.full_name || 'Supplier';
    const avatarInitial = supplierName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    
    const completionRate = supplier.completion_rate || 100;
    const responseTime = supplier.response_time_hours || '24';
    
    const card = document.getElementById('supplierCard');
    card.innerHTML = `
        <div class="supplier-avatar-large">
            ${profile.avatar_url ? 
                `<img src="${profile.avatar_url}" alt="${supplierName}">` : 
                avatarInitial
            }
        </div>
        <div class="supplier-info-large">
            <h2>
                ${escapeHtml(supplierName)}
                ${supplier.verification_status === 'verified' ? 
                    '<span class="verified-badge-large"><i class="fas fa-check-circle"></i> Verified</span>' : 
                    ''
                }
            </h2>
            <div class="supplier-meta">
                <span class="supplier-meta-item">
                    <i class="fas fa-map-marker-alt"></i>
                    ${escapeHtml(profile.location || 'Uganda')}
                </span>
                <span class="supplier-meta-item">
                    <i class="fas fa-clock"></i>
                    ⏱ ${responseTime}h avg. response
                </span>
                <span class="supplier-meta-item">
                    <i class="fas fa-check-circle"></i>
                    ${completionRate}% completion
                </span>
                <span class="supplier-rating-large">
                    <i class="fas fa-star"></i>
                    <i class="fas fa-star"></i>
                    <i class="fas fa-star"></i>
                    <i class="fas fa-star"></i>
                    <i class="fas fa-star-half-alt"></i>
                </span>
            </div>
            ${supplier.year_established ? `
                <div class="supplier-meta-item" style="margin-top: 8px;">
                    <i class="fas fa-calendar-alt"></i>
                    Established ${supplier.year_established}
                </div>
            ` : ''}
        </div>
    `;
}

function renderAmountSummary() {
    const items = quote.supplier_quote_items || [];
    const subtotal = items.reduce((sum, item) => sum + (item.total_price || 0), 0);
    
    // Calculate average from other quotes for comparison
    let avgPrice = 0;
    let savings = 0;
    if (otherQuotes.length > 0) {
        avgPrice = otherQuotes.reduce((sum, q) => sum + q.total_amount, 0) / otherQuotes.length;
        savings = avgPrice - quote.total_amount;
    }
    
    const summary = document.getElementById('amountSummary');
    summary.innerHTML = `
        <div class="amount-card">
            <span class="amount-label">Subtotal</span>
            <span class="amount-value">UGX ${formatNumber(subtotal)}</span>
        </div>
        <div class="amount-card">
            <span class="amount-label">Total Amount</span>
            <span class="amount-value">UGX ${formatNumber(quote.total_amount)}</span>
        </div>
        ${avgPrice > 0 ? `
            <div class="amount-card">
                <span class="amount-label">vs. Average</span>
                <span class="amount-value ${savings >= 0 ? 'text-success' : 'text-danger'}">
                    ${savings >= 0 ? '-' : '+'} UGX ${formatNumber(Math.abs(Math.round(savings)))}
                </span>
                <span class="amount-savings">
                    ${savings >= 0 ? 'You save' : 'Above average'}
                </span>
            </div>
        ` : ''}
    `;
}

function renderItemsTable() {
    const tbody = document.getElementById('itemsTableBody');
    const items = quote.supplier_quote_items || [];
    
    if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No items in this quote</td></tr>';
        return;
    }
    
    tbody.innerHTML = items.map(item => `
        <tr>
            <td>
                <span class="product-name">${escapeHtml(item.product_name || 'Product')}</span>
                ${item.product_sku ? `<span class="product-sku">SKU: ${item.product_sku}</span>` : ''}
            </td>
            <td class="quantity-cell">${item.quantity || 0}</td>
            <td class="price-cell">UGX ${formatNumber(item.unit_price)}</td>
            <td class="total-cell">UGX ${formatNumber(item.total_price)}</td>
            <td class="notes-cell">${escapeHtml(item.notes || '')}</td>
        </tr>
    `).join('');
}

function renderTerms() {
    const termsGrid = document.getElementById('termsGrid');
    
    termsGrid.innerHTML = `
        <div class="term-group">
            <span class="term-label">Payment Terms</span>
            <span class="term-value">${formatPaymentTerms(quote.payment_terms?.[0])}</span>
            <span class="term-description">Payment due before or upon delivery</span>
        </div>
        <div class="term-group">
            <span class="term-label">Delivery Terms</span>
            <span class="term-value">${formatDeliveryTerms(quote.delivery_terms?.[0])}</span>
            <span class="term-description">Responsibility and cost of delivery</span>
        </div>
        <div class="term-group">
            <span class="term-label">Valid Until</span>
            <span class="term-value">${formatDate(quote.valid_until)}</span>
            <span class="term-description ${checkIfExpiring(quote.valid_until) ? 'text-danger' : ''}">
                ${getValidityMessage(quote.valid_until)}
            </span>
        </div>
        <div class="term-group">
            <span class="term-label">Lead Time</span>
            <span class="term-value">${quote.lead_time_days ? quote.lead_time_days + ' days' : 'Not specified'}</span>
            <span class="term-description">Time from order to dispatch</span>
        </div>
    `;
}

function renderNotes() {
    if (!quote.notes) {
        document.getElementById('notesSection').style.display = 'none';
        return;
    }
    
    document.getElementById('notesSection').style.display = 'block';
    document.getElementById('quoteNotes').textContent = quote.notes;
}

function renderAttachments() {
    // Since we don't have attachments in supplier_quotes yet,
    // this would need to be extended if you add that feature
    document.getElementById('attachmentsSection').style.display = 'none';
}

function renderComparison() {
    if (otherQuotes.length === 0) {
        document.getElementById('comparisonSection').style.display = 'none';
        return;
    }
    
    document.getElementById('comparisonSection').style.display = 'block';
    
    const minPrice = Math.min(...otherQuotes.map(q => q.total_amount), quote.total_amount);
    const maxPrice = Math.max(...otherQuotes.map(q => q.total_amount), quote.total_amount);
    
    const preview = document.getElementById('comparisonPreview');
    preview.innerHTML = `
        <div class="comparison-header">
            <h4>Other Quotes (${otherQuotes.length})</h4>
            <div class="comparison-stats">
                <div class="comparison-stat">
                    <span class="stat-number">UGX ${formatNumber(minPrice)}</span>
                    <span class="stat-label">Lowest</span>
                </div>
                <div class="comparison-stat">
                    <span class="stat-number">UGX ${formatNumber(maxPrice)}</span>
                    <span class="stat-label">Highest</span>
                </div>
            </div>
        </div>
        <div class="comparison-suppliers">
            ${otherQuotes.slice(0, 3).map(q => {
                const supplierName = q.suppliers?.business_name || 'Supplier';
                const avatarInitial = supplierName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                const priceDiff = q.total_amount - quote.total_amount;
                const diffPercent = ((priceDiff / quote.total_amount) * 100).toFixed(1);
                
                return `
                    <div class="supplier-mini-card">
                        <div class="supplier-mini-avatar">
                            ${q.suppliers?.profiles?.avatar_url ? 
                                `<img src="${q.suppliers.profiles.avatar_url}" alt="${supplierName}">` : 
                                avatarInitial
                            }
                        </div>
                        <div class="supplier-mini-name">${escapeHtml(supplierName)}</div>
                        <div class="supplier-mini-price">UGX ${formatNumber(q.total_amount)}</div>
                        <div class="supplier-mini-diff ${priceDiff > 0 ? '' : 'negative'}">
                            ${priceDiff > 0 ? '+' : ''}${diffPercent}%
                        </div>
                    </div>
                `;
            }).join('')}
            ${otherQuotes.length > 3 ? `
                <div class="supplier-mini-card">
                    <div class="supplier-mini-avatar">+${otherQuotes.length - 3}</div>
                    <div class="supplier-mini-name">More quotes</div>
                    <button class="btn-link" onclick="window.location.href='compare-quotes.html?id=${inquiry.id}'">
                        View All
                    </button>
                </div>
            ` : ''}
        </div>
    `;
}

function renderActionButtons() {
    const container = document.getElementById('actionButtons');
    
    if (quote.status === 'accepted') {
        container.innerHTML = `
            <button class="btn-large secondary" onclick="window.location.href='orders.html'">
                <i class="fas fa-eye"></i> View Order
            </button>
            <button class="btn-large secondary" onclick="window.location.href='my-inquiries.html'">
                <i class="fas fa-arrow-left"></i> Back to Inquiries
            </button>
        `;
    } else if (quote.status === 'rejected') {
        container.innerHTML = `
            <button class="btn-large secondary" onclick="window.location.href='my-inquiries.html'">
                <i class="fas fa-arrow-left"></i> Back to Inquiries
            </button>
        `;
    } else if (quote.status === 'expired') {
        container.innerHTML = `
            <button class="btn-large secondary" onclick="resendInquiry()">
                <i class="fas fa-redo"></i> Request New Quote
            </button>
            <button class="btn-large secondary" onclick="window.location.href='my-inquiries.html'">
                <i class="fas fa-arrow-left"></i> Back to Inquiries
            </button>
        `;
    } else {
        // Sent status - show action buttons
        container.innerHTML = `
            <button class="btn-large accept" onclick="showAcceptModal()">
                <i class="fas fa-check-circle"></i> Accept Quote
            </button>
            <button class="btn-large negotiate" onclick="showNegotiateModal()">
                <i class="fas fa-handshake"></i> Negotiate
            </button>
            <button class="btn-large reject" onclick="showRejectModal()">
                <i class="fas fa-times-circle"></i> Reject
            </button>
        `;
    }
}

// ============================================
// MODAL FUNCTIONS
// ============================================
window.showAcceptModal = function() {
    const modalBody = document.getElementById('acceptModalBody');
    
    modalBody.innerHTML = `
        <p>You are about to accept the quotation from <strong>${escapeHtml(quote.suppliers?.business_name || 'Supplier')}</strong></p>
        
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
    
    document.getElementById('acceptTerms')?.addEventListener('change', (e) => {
        document.getElementById('confirmAcceptBtn').disabled = !e.target.checked;
    });
    
    document.getElementById('confirmAcceptBtn')?.addEventListener('click', acceptQuote);
    
    document.getElementById('acceptModal').classList.add('show');
};

window.showRejectModal = function() {
    const modalBody = document.getElementById('rejectModalBody');
    
    modalBody.innerHTML = `
        <p>Please tell us why you're rejecting this quotation:</p>
        
        <select class="reason-select" id="rejectReason">
            <option value="">Select a reason</option>
            <option value="price">Price too high</option>
            <option value="terms">Terms unacceptable</option>
            <option value="delivery">Delivery time too long</option>
            <option value="found_better">Found better offer</option>
            <option value="changed_mind">Changed my mind</option>
            <option value="other">Other</option>
        </select>
        
        <textarea class="reason-text" id="rejectDetails" placeholder="Additional details (optional)"></textarea>
        
        <div class="modal-actions">
            <button class="btn-confirm" style="background: var(--danger);" id="confirmRejectBtn" disabled>Confirm Rejection</button>
            <button class="btn-cancel" onclick="closeRejectModal()">Cancel</button>
        </div>
    `;
    
    document.getElementById('rejectReason')?.addEventListener('change', (e) => {
        document.getElementById('confirmRejectBtn').disabled = !e.target.value;
    });
    
    document.getElementById('confirmRejectBtn')?.addEventListener('click', () => rejectQuote());
    
    document.getElementById('rejectModal').classList.add('show');
};

window.showNegotiateModal = function() {
    const modalBody = document.getElementById('negotiateModalBody');
    const items = quote.supplier_quote_items || [];
    
    modalBody.innerHTML = `
        <p>Propose your counter-offer for each item:</p>
        
        <div class="negotiate-form" id="negotiateForm">
            ${items.map((item, index) => `
                <div class="negotiate-item">
                    <h4>${escapeHtml(item.product_name || 'Product')}</h4>
                    <div class="item-details">
                        <span class="current-price">Current: <span>UGX ${formatNumber(item.unit_price)}</span> x ${item.quantity}</span>
                        <span class="current-price">Total: <span>UGX ${formatNumber(item.total_price)}</span></span>
                    </div>
                    <div class="negotiate-input-group">
                        <input type="number" 
                               class="negotiate-price" 
                               data-item-id="${item.id}"
                               data-index="${index}"
                               value="${item.unit_price}"
                               min="1"
                               step="100">
                        <span>UGX per unit</span>
                    </div>
                </div>
            `).join('')}
            
            <div class="form-group" style="margin-top: 16px;">
                <label for="negotiateMessage">Message to Supplier:</label>
                <textarea id="negotiateMessage" rows="3" style="width: 100%; padding: 10px; border: 1px solid var(--gray-300); border-radius: var(--radius-sm);" 
                    placeholder="Explain your counter-offer..."></textarea>
            </div>
        </div>
        
        <div class="modal-actions">
            <button class="btn-confirm" style="background: var(--primary);" id="sendNegotiationBtn">Send Counter-Offer</button>
            <button class="btn-cancel" onclick="closeNegotiateModal()">Cancel</button>
        </div>
    `;
    
    // Add event listeners to update totals
    document.querySelectorAll('.negotiate-price').forEach(input => {
        input.addEventListener('change', updateNegotiationTotal);
    });
    
    document.getElementById('sendNegotiationBtn')?.addEventListener('click', sendNegotiation);
    
    document.getElementById('negotiateModal').classList.add('show');
};

// ============================================
// QUOTE ACTIONS
// ============================================
async function acceptQuote() {
    try {
        // Update quote status
        const { error: updateError } = await sb
            .from('supplier_quotes')
            .update({ status: 'accepted' })
            .eq('id', quote.id);
            
        if (updateError) throw updateError;
        
        // Reject all other quotes for this inquiry
        if (otherQuotes.length > 0) {
            await sb
                .from('supplier_quotes')
                .update({ status: 'rejected' })
                .eq('inquiry_id', inquiry.id)
                .neq('id', quote.id)
                .eq('status', 'sent');
        }
        
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
                original_quote_id: quote.id,
                inquiry_id: inquiry.id,
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
            .eq('id', inquiry.id);
        
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
        
        // Close modal
        closeAcceptModal();
        
        // Show success
        document.getElementById('successMessage').textContent = 
            'Quote accepted successfully! Your order has been created.';
        document.getElementById('successModal').classList.add('show');
        
        // Refresh data
        quote.status = 'accepted';
        renderStatusBar();
        renderActionButtons();
        
    } catch (error) {
        console.error('Error accepting quote:', error);
        showToast('Failed to accept quote');
    }
}

async function rejectQuote() {
    const reason = document.getElementById('rejectReason')?.value;
    const details = document.getElementById('rejectDetails')?.value;
    
    if (!reason) return;
    
    try {
        // Update quote status
        const { error: updateError } = await sb
            .from('supplier_quotes')
            .update({ 
                status: 'rejected',
                rejection_reason: reason,
                rejection_details: details
            })
            .eq('id', quote.id);
            
        if (updateError) throw updateError;
        
        // Create notification for supplier
        await sb
            .from('notifications')
            .insert({
                user_id: quote.supplier_id,
                type: 'quote_rejected',
                title: 'Quote Rejected',
                message: `Your quotation for "${inquiry.title}" has been rejected`,
                link: `/supplier-quote.html?id=${quote.id}`,
                ad_id: null
            });
        
        // Close modal
        closeRejectModal();
        
        showToast('Quote rejected');
        
        // Refresh data
        quote.status = 'rejected';
        renderStatusBar();
        renderActionButtons();
        
    } catch (error) {
        console.error('Error rejecting quote:', error);
        showToast('Failed to reject quote');
    }
}

function updateNegotiationTotal() {
    // Calculate new total based on updated prices
    let newTotal = 0;
    document.querySelectorAll('.negotiate-price').forEach(input => {
        newTotal += parseFloat(input.value) * parseInt(input.getAttribute('data-quantity') || 1);
    });
    
    // Could display running total
}

async function sendNegotiation() {
    if (negotiationInProgress) return;
    
    negotiationInProgress = true;
    
    try {
        // Collect counter-offer data
        const counterOffers = [];
        document.querySelectorAll('.negotiate-price').forEach(input => {
            const itemId = input.dataset.itemId;
            const newPrice = parseFloat(input.value);
            
            const originalItem = quote.supplier_quote_items.find(i => i.id === parseInt(itemId));
            if (originalItem && newPrice !== originalItem.unit_price) {
                counterOffers.push({
                    item_id: itemId,
                    product_name: originalItem.product_name,
                    original_price: originalItem.unit_price,
                    proposed_price: newPrice,
                    quantity: originalItem.quantity
                });
            }
        });
        
        const message = document.getElementById('negotiateMessage')?.value;
        
        if (counterOffers.length === 0) {
            showToast('No changes made to prices');
            negotiationInProgress = false;
            return;
        }
        
        // Create negotiation record
        const { data: negotiation, error: negotiationError } = await sb
            .from('negotiations')
            .insert({
                buyer_id: currentUser.id,
                supplier_id: quote.supplier_id,
                ad_id: null, // You might want to link to the first product
                requested_quantity: 1,
                requested_price: null,
                buyer_message: message || 'Counter-offer sent',
                status: 'countered',
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            })
            .select()
            .single();
            
        if (negotiationError) throw negotiationError;
        
        // Create notification for supplier
        await sb
            .from('notifications')
            .insert({
                user_id: quote.supplier_id,
                type: 'negotiation_received',
                title: 'Counter-Offer Received',
                message: `You've received a counter-offer for "${inquiry.title}"`,
                link: `/supplier-negotiation.html?id=${negotiation.id}`,
                ad_id: null
            });
        
        closeNegotiateModal();
        showToast('Counter-offer sent to supplier');
        
    } catch (error) {
        console.error('Error sending negotiation:', error);
        showToast('Failed to send counter-offer');
    } finally {
        negotiationInProgress = false;
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function showLoading(show) {
    const loadingEl = document.getElementById('loadingState');
    const contentEl = document.getElementById('quoteContent');
    const errorEl = document.getElementById('errorState');
    
    if (!loadingEl || !contentEl || !errorEl) return;
    
    if (show) {
        loadingEl.style.display = 'block';
        contentEl.style.display = 'none';
        errorEl.style.display = 'none';
    } else {
        loadingEl.style.display = 'none';
    }
}

function showError(message) {
    showLoading(false);
    document.getElementById('errorState').style.display = 'block';
    document.getElementById('quoteContent').style.display = 'none';
    if (message) showToast(message);
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
            month: 'long',
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

function getStatusIcon(status) {
    const icons = {
        'sent': 'fa-paper-plane',
        'accepted': 'fa-check-circle',
        'rejected': 'fa-times-circle',
        'expired': 'fa-clock'
    };
    return icons[status] || 'fa-file-invoice';
}

function checkIfExpiring(expiryDate) {
    if (!expiryDate) return false;
    const expiry = new Date(expiryDate);
    const now = new Date();
    const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    return diffDays <= 3;
}

function getDaysUntilExpiry(expiryDate) {
    if (!expiryDate) return 0;
    const expiry = new Date(expiryDate);
    const now = new Date();
    const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    return diffDays;
}

function getValidityMessage(expiryDate) {
    if (!expiryDate) return 'No expiry date';
    const days = getDaysUntilExpiry(expiryDate);
    if (days < 0) return 'Expired';
    if (days === 0) return 'Expires today';
    if (days === 1) return 'Expires tomorrow';
    return `${days} days remaining`;
}

function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ============================================
// ACTION FUNCTIONS
// ============================================
window.printQuote = function() {
    window.print();
};

window.shareQuote = function() {
    if (navigator.share) {
        navigator.share({
            title: `Quote ${quote.quote_number}`,
            text: `Quote from ${quote.suppliers?.business_name} for UGX ${formatNumber(quote.total_amount)}`,
            url: window.location.href
        }).catch(console.error);
    } else {
        // Fallback
        navigator.clipboard.writeText(window.location.href);
        showToast('Link copied to clipboard');
    }
};

window.resendInquiry = function() {
    window.location.href = `send-inquiry.html?edit=${inquiry.id}`;
};

// ============================================
// MODAL CLOSE FUNCTIONS
// ============================================
window.closeAcceptModal = function() {
    document.getElementById('acceptModal').classList.remove('show');
};

window.closeRejectModal = function() {
    document.getElementById('rejectModal').classList.remove('show');
};

window.closeNegotiateModal = function() {
    document.getElementById('negotiateModal').classList.remove('show');
    negotiationInProgress = false;
};

window.closeSuccessModal = function() {
    document.getElementById('successModal').classList.remove('show');
};

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Close modals when clicking outside
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeAcceptModal();
                closeRejectModal();
                closeNegotiateModal();
                closeSuccessModal();
            }
        });
    });
}

// ============================================
// REALTIME SUBSCRIPTIONS
// ============================================
function setupRealtimeSubscription() {
    // Listen for quote status changes
    const quoteSubscription = sb
        .channel('quote-status-' + quoteId)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'supplier_quotes',
                filter: `id=eq.${quoteId}`
            },
            async (payload) => {
                if (payload.new.status !== quote.status) {
                    quote.status = payload.new.status;
                    renderStatusBar();
                    renderActionButtons();
                    showToast(`Quote status updated to ${payload.new.status}`);
                }
            }
        )
        .subscribe();
}

// ============================================
// EXPORT FUNCTIONS FOR GLOBAL SCOPE
// ============================================
window.showAcceptModal = showAcceptModal;
window.showRejectModal = showRejectModal;
window.showNegotiateModal = showNegotiateModal;
window.closeAcceptModal = closeAcceptModal;
window.closeRejectModal = closeRejectModal;
window.closeNegotiateModal = closeNegotiateModal;
window.closeSuccessModal = closeSuccessModal;
window.printQuote = printQuote;
window.shareQuote = shareQuote;
window.resendInquiry = resendInquiry;