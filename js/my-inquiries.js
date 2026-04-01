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
let allInquiries = [];
let filteredInquiries = [];
let currentFilter = 'all';
let searchTerm = '';
let selectedInquiry = null;
let selectedQuote = null;

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await loadInquiries();
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
            window.location.href = 'login.html?redirect=my-inquiries.html';
            return;
        }
        currentUser = user;
    } catch (error) {
        console.error('Error checking auth:', error);
        window.location.href = 'login.html';
    }
}

// ============================================
// LOAD INQUIRIES
// ============================================
async function loadInquiries() {
    showLoading(true);
    
    try {
        // Get all inquiries for this buyer
        const { data: inquiries, error } = await sb
            .from('inquiry_requests')
            .select(`
                *,
                inquiry_items (*),
                inquiry_supplier_matches (
                    supplier_id,
                    has_quoted,
                    suppliers!inner (
                        id,
                        business_name,
                        profiles!suppliers_profile_id_fkey (
                            avatar_url
                        )
                    )
                )
            `)
            .eq('buyer_id', currentUser.id)
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        allInquiries = inquiries || [];
        
        // For each inquiry, get quotations if any
        for (let inquiry of allInquiries) {
            inquiry.quotations = await loadQuotations(inquiry.id);
            inquiry.status = determineInquiryStatus(inquiry);
        }
        
        applyFilters();
        updateStats();
        
    } catch (error) {
        console.error('Error loading inquiries:', error);
        showToast('Failed to load inquiries');
    } finally {
        showLoading(false);
    }
}

async function loadQuotations(inquiryId) {
    try {
        const { data: quotes, error } = await sb
            .from('supplier_quotes')
            .select(`
                *,
                suppliers!inner (
                    id,
                    business_name,
                    profiles!suppliers_profile_id_fkey (
                        avatar_url,
                        full_name
                    )
                ),
                supplier_quote_items (*)
            `)
            .eq('inquiry_id', inquiryId)
            .in('status', ['sent', 'accepted', 'converted'])
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        return quotes || [];
    } catch (error) {
        console.error('Error loading quotations:', error);
        return [];
    }
}

function determineInquiryStatus(inquiry) {
    if (!inquiry) return 'pending';
    
    // Check if expired
    if (inquiry.expires_at && new Date(inquiry.expires_at) < new Date()) {
        return 'expired';
    }
    
    // Check if any quote is accepted
    if (inquiry.quotations && inquiry.quotations.some(q => q.status === 'accepted' || q.status === 'converted')) {
        return 'accepted';
    }
    
    // Check if has quotes
    if (inquiry.quotations && inquiry.quotations.length > 0) {
        return 'quoted';
    }
    
    return 'pending';
}

// ============================================
// FILTERING AND SEARCH
// ============================================
function applyFilters() {
    filteredInquiries = allInquiries.filter(inquiry => {
        // Filter by status
        if (currentFilter !== 'all' && inquiry.status !== currentFilter) {
            return false;
        }
        
        // Search by title or number
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            const matchesTitle = inquiry.title?.toLowerCase().includes(term);
            const matchesNumber = inquiry.inquiry_number?.toLowerCase().includes(term);
            if (!matchesTitle && !matchesNumber) {
                return false;
            }
        }
        
        return true;
    });
    
    renderInquiries();
}

function updateStats() {
    const pending = allInquiries.filter(i => i.status === 'pending').length;
    const quoted = allInquiries.filter(i => i.status === 'quoted').length;
    const accepted = allInquiries.filter(i => i.status === 'accepted').length;
    
    document.getElementById('pendingCount').textContent = pending;
    document.getElementById('quotedCount').textContent = quoted;
    document.getElementById('acceptedCount').textContent = accepted;
    document.getElementById('totalCount').textContent = allInquiries.length;
}

// ============================================
// RENDERING
// ============================================
function renderInquiries() {
    const container = document.getElementById('inquiriesList');
    const emptyState = document.getElementById('emptyState');
    
    if (!container) return;
    
    if (filteredInquiries.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    
    container.innerHTML = filteredInquiries.map(inquiry => renderInquiryCard(inquiry)).join('');
}

function renderInquiryCard(inquiry) {
    if (!inquiry) return '';
    
    const items = inquiry.inquiry_items || [];
    const totalQuantity = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const isExpiring = checkIfExpiring(inquiry.expires_at);
    const quoteCount = inquiry.quotations?.length || 0;
    
    // Get unique suppliers who have quoted
    const quotedSuppliers = inquiry.quotations?.map(q => q.suppliers?.business_name) || [];
    const uniqueSuppliers = [...new Set(quotedSuppliers)];
    
    return `
        <div class="inquiry-card" data-inquiry-id="${inquiry.id}">
            <div class="inquiry-header">
                <div class="inquiry-title-section">
                    <div class="inquiry-title">
                        ${escapeHtml(inquiry.title || 'Untitled Inquiry')}
                        <span class="inquiry-number">${inquiry.inquiry_number || 'No number'}</span>
                    </div>
                </div>
                <span class="inquiry-status ${inquiry.status}">
                    ${formatStatus(inquiry.status)}
                </span>
            </div>
            
            <div class="inquiry-meta">
                <div class="meta-item">
                    <i class="fas fa-calendar"></i>
                    <span class="label">Sent:</span>
                    <span class="value">${formatDate(inquiry.created_at)}</span>
                </div>
                <div class="meta-item">
                    <i class="fas fa-clock"></i>
                    <span class="label">Expires:</span>
                    <span class="value ${isExpiring ? 'expiring' : ''}">${formatDate(inquiry.expires_at)}</span>
                </div>
                <div class="meta-item">
                    <i class="fas fa-boxes"></i>
                    <span class="label">Items:</span>
                    <span class="value">${items.length}</span>
                </div>
                <div class="meta-item">
                    <i class="fas fa-weight-hanging"></i>
                    <span class="label">Total Qty:</span>
                    <span class="value">${totalQuantity}</span>
                </div>
            </div>
            
            <div class="products-summary">
                <div class="product-tags">
                    ${items.slice(0, 3).map(item => `
                        <span class="product-tag">
                            ${escapeHtml(item.product_name || 'Product')}
                            <span class="quantity">${item.quantity || 0}</span>
                        </span>
                    `).join('')}
                    ${items.length > 3 ? `
                        <span class="more-products">+${items.length - 3} more</span>
                    ` : ''}
                </div>
            </div>
            
            ${quoteCount > 0 ? `
                <div class="quote-indicators">
                    <div class="quote-count">
                        <i class="fas fa-file-invoice"></i>
                        <span>${quoteCount} quotation${quoteCount > 1 ? 's' : ''} received</span>
                    </div>
                    ${uniqueSuppliers.length > 0 ? `
                        <div class="quote-count">
                            <i class="fas fa-building"></i>
                            <span>from ${uniqueSuppliers.length} supplier${uniqueSuppliers.length > 1 ? 's' : ''}</span>
                        </div>
                    ` : ''}
                </div>
            ` : ''}
            
            <div class="inquiry-footer">
                <div class="date-info ${isExpiring ? 'expiring' : ''}">
                    <i class="fas fa-hourglass-half"></i>
                    <span>${getTimeRemaining(inquiry.expires_at)}</span>
                </div>
                <div class="inquiry-actions">
                    <button class="btn-sm secondary" onclick="viewInquiryDetails(${inquiry.id})">
                        <i class="fas fa-eye"></i> View
                    </button>
                    ${quoteCount > 0 ? `
                        <button class="btn-sm primary" onclick="viewQuotations(${inquiry.id})">
                            <i class="fas fa-file-invoice"></i> Quotes (${quoteCount})
                        </button>
                    ` : `
                        <button class="btn-sm outline" onclick="window.location.href='send-inquiry.html?edit=${inquiry.id}'">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                    `}
                </div>
            </div>
        </div>
    `;
}

function renderQuotationsModal(inquiry) {
    const modalBody = document.getElementById('quoteModalBody');
    const quotes = inquiry.quotations || [];
    
    if (quotes.length === 0) {
        modalBody.innerHTML = '<p class="no-quotes">No quotations received yet</p>';
        return;
    }
    
    const html = `
        <div class="quote-list">
            ${quotes.map(quote => `
                <div class="quote-item" data-quote-id="${quote.id}">
                    <div class="quote-header">
                        <div class="supplier-info">
                            <div class="supplier-avatar">
                                ${quote.suppliers?.profiles?.avatar_url ? 
                                    `<img src="${quote.suppliers.profiles.avatar_url}" alt="${quote.suppliers.business_name}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">` : 
                                    (quote.suppliers?.business_name || 'S').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
                                }
                            </div>
                            <div>
                                <div class="supplier-name">${escapeHtml(quote.suppliers?.business_name || 'Supplier')}</div>
                                <div class="supplier-rating">
                                    <i class="fas fa-star"></i>
                                    <i class="fas fa-star"></i>
                                    <i class="fas fa-star"></i>
                                    <i class="fas fa-star"></i>
                                    <i class="fas fa-star-half-alt"></i>
                                </div>
                            </div>
                        </div>
                        <div class="quote-amount">
                            <span class="amount">UGX ${formatNumber(quote.total_amount)}</span>
                            <span class="validity">Valid until ${formatDate(quote.valid_until)}</span>
                        </div>
                    </div>
                    
                    <div class="quote-items-preview">
                        <strong>${quote.supplier_quote_items?.length || 0} items quoted</strong>
                    </div>
                    
                    <div class="quote-actions">
                        ${quote.status === 'sent' ? `
                            <button class="accept-btn" onclick="showAcceptQuote(${quote.id})">
                                Accept Quote
                            </button>
                            <button class="reject-btn" onclick="rejectQuote(${quote.id})">
                                Reject
                            </button>
                        ` : `
                            <span class="status-badge ${quote.status}">${quote.status}</span>
                        `}
                    </div>
                    
                    <button class="view-details-btn" onclick="viewQuoteDetails(${quote.id})">
                        <i class="fas fa-chevron-down"></i> View Full Details
                    </button>
                </div>
            `).join('')}
        </div>
    `;
    
    modalBody.innerHTML = html;
}

function renderAcceptModal(quote) {
    const modalBody = document.getElementById('acceptModalBody');
    
    const html = `
        <p>You are about to accept the quotation from <strong>${escapeHtml(quote.suppliers?.business_name || 'Supplier')}</strong></p>
        
        <div class="selected-quote-info">
            <h4>Quote Summary</h4>
            <div class="info-row">
                <span class="info-label">Quote Number:</span>
                <span class="info-value">${quote.quote_number || 'N/A'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Total Amount:</span>
                <span class="info-value">UGX ${formatNumber(quote.total_amount)}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Payment Terms:</span>
                <span class="info-value">${formatPaymentTerms(quote.payment_terms?.[0])}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Delivery Terms:</span>
                <span class="info-value">${formatDeliveryTerms(quote.delivery_terms?.[0])}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Valid Until:</span>
                <span class="info-value">${formatDate(quote.valid_until)}</span>
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

// ============================================
// QUOTE ACTIONS
// ============================================
async function acceptQuote(quoteId) {
    try {
        // Get quote details
        const { data: quote, error: quoteError } = await sb
            .from('supplier_quotes')
            .select('*, inquiry_requests!inner(*)')
            .eq('id', quoteId)
            .single();
            
        if (quoteError) throw quoteError;
        
        // Update quote status
        const { error: updateError } = await sb
            .from('supplier_quotes')
            .update({ status: 'accepted' })
            .eq('id', quoteId);
            
        if (updateError) throw updateError;
        
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
                inquiry_id: quote.inquiry_id,
                created_at: new Date().toISOString()
            })
            .select()
            .single();
            
        if (orderError) throw orderError;
        
        // Create order items from quote items
        const { data: quoteItems, error: itemsError } = await sb
            .from('supplier_quote_items')
            .select('*')
            .eq('supplier_quote_id', quoteId);
            
        if (itemsError) throw itemsError;
        
        if (quoteItems && quoteItems.length > 0) {
            const orderItems = quoteItems.map(item => ({
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
            .eq('id', quote.inquiry_id);
        
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
        
        // Refresh inquiries
        await loadInquiries();
        
    } catch (error) {
        console.error('Error accepting quote:', error);
        showToast('Failed to accept quote');
    }
}

async function rejectQuote(quoteId) {
    if (!confirm('Are you sure you want to reject this quotation?')) return;
    
    try {
        const { error } = await sb
            .from('supplier_quotes')
            .update({ status: 'rejected' })
            .eq('id', quoteId);
            
        if (error) throw error;
        
        showToast('Quote rejected');
        closeQuoteModal();
        await loadInquiries();
        
    } catch (error) {
        console.error('Error rejecting quote:', error);
        showToast('Failed to reject quote');
    }
}

// ============================================
// VIEW FUNCTIONS
// ============================================
window.viewInquiryDetails = function(inquiryId) {
    window.location.href = `inquiry-details.html?id=${inquiryId}`;
};

window.viewQuotations = function(inquiryId) {
    const inquiry = allInquiries.find(i => i.id === inquiryId);
    if (!inquiry) return;
    
    selectedInquiry = inquiry;
    renderQuotationsModal(inquiry);
    document.getElementById('quoteModal').classList.add('show');
};

window.viewQuoteDetails = function(quoteId) {
    // Navigate to quote details page or open in modal
    window.location.href = `quote-details.html?id=${quoteId}`;
};

window.showAcceptQuote = function(quoteId) {
    // Find quote in selected inquiry
    const quote = selectedInquiry?.quotations?.find(q => q.id === quoteId);
    if (!quote) return;
    
    selectedQuote = quote;
    renderAcceptModal(quote);
    document.getElementById('acceptModal').classList.add('show');
};

// ============================================
// UTILITY FUNCTIONS
// ============================================
function showLoading(show) {
    const loadingEl = document.getElementById('loadingState');
    const mainContent = document.getElementById('mainContent');
    
    if (!loadingEl || !mainContent) return;
    
    if (show) {
        loadingEl.style.display = 'block';
        mainContent.style.display = 'none';
    } else {
        loadingEl.style.display = 'none';
        mainContent.style.display = 'block';
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
            currentFilter = btn.dataset.filter;
            applyFilters();
        });
    });
    
    // Search input
    document.getElementById('searchInput')?.addEventListener('input', (e) => {
        searchTerm = e.target.value;
        applyFilters();
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
    // Listen for new quotes
    const quoteSubscription = sb
        .channel('quote-changes')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'supplier_quotes'
            },
            async (payload) => {
                // Check if this quote is for one of our inquiries
                const inquiry = allInquiries.find(i => i.id === payload.new.inquiry_id);
                if (inquiry) {
                    showToast('New quotation received!');
                    await loadInquiries();
                }
            }
        )
        .subscribe();
}

// ============================================
// EXPORT FUNCTIONS FOR GLOBAL SCOPE
// ============================================
window.viewInquiryDetails = viewInquiryDetails;
window.viewQuotations = viewQuotations;
window.viewQuoteDetails = viewQuoteDetails;
window.showAcceptQuote = showAcceptQuote;
window.rejectQuote = rejectQuote;
window.closeQuoteModal = closeQuoteModal;
window.closeAcceptModal = closeAcceptModal;
window.closeSuccessModal = closeSuccessModal;