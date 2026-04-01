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
let currentSupplier = null;
let whatsappNumbers = [];
let templates = [];
let conversations = [];
let deleteId = null;

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await loadSupplierData();
    await loadWhatsAppNumbers();
    await loadTemplates();
    await loadRecentConversations();
    await loadStats();
    setupEventListeners();
});

// ============================================
// CHECK AUTH
// ============================================
async function checkAuth() {
    try {
        const { data: { user }, error } = await sb.auth.getUser();
        
        if (error || !user) {
            window.location.href = 'login.html';
            return;
        }
        
        currentUser = user;
        
        // Load user profile
        const { data: profile } = await sb
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
            
        if (profile) {
            document.getElementById('businessName').textContent = profile.business_name || 'Supplier';
        }
        
    } catch (error) {
        console.error('Auth error:', error);
        window.location.href = 'login.html';
    }
}

// ============================================
// LOAD SUPPLIER DATA
// ============================================
async function loadSupplierData() {
    try {
        const { data: supplier, error } = await sb
            .from('suppliers')
            .select('*')
            .eq('profile_id', currentUser.id)
            .single();
            
        if (error) throw error;
        currentSupplier = supplier;
        
    } catch (error) {
        console.error('Error loading supplier:', error);
        showToast('Error loading supplier data', 'error');
    }
}

// ============================================
// LOAD WHATSAPP NUMBERS
// ============================================
async function loadWhatsAppNumbers() {
    try {
        showLoading(true, 'Loading WhatsApp numbers...');
        
        const { data, error } = await sb
            .from('supplier_whatsapp')
            .select('*')
            .eq('supplier_id', currentSupplier.id)
            .order('is_primary', { ascending: false })
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        whatsappNumbers = data || [];
        renderWhatsAppNumbers();
        
    } catch (error) {
        console.error('Error loading WhatsApp numbers:', error);
        showToast('Error loading WhatsApp numbers', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================
// RENDER WHATSAPP NUMBERS
// ============================================
function renderWhatsAppNumbers() {
    const container = document.getElementById('whatsappList');
    
    if (whatsappNumbers.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fab fa-whatsapp" style="font-size: 48px; color: #25D366;"></i>
                <h3>No WhatsApp Numbers Added</h3>
                <p>Add your first WhatsApp number to start receiving inquiries</p>
                <button class="btn btn-primary" onclick="document.getElementById('addWhatsAppBtn').click()">
                    <i class="fas fa-plus"></i> Add WhatsApp Number
                </button>
            </div>
        `;
        return;
    }
    
    let html = '';
    whatsappNumbers.forEach(number => {
        const availability = number.availability_hours || {};
        const statusClass = number.is_active ? 'active' : 'inactive';
        
        html += `
            <div class="whatsapp-card ${statusClass}" data-id="${number.id}">
                <div class="whatsapp-header">
                    <div class="whatsapp-title">
                        <i class="fab fa-whatsapp" style="color: #25D366;"></i>
                        <h4>${number.label}</h4>
                        ${number.is_primary ? '<span class="primary-badge">Primary</span>' : ''}
                        ${!number.is_active ? '<span class="inactive-badge">Inactive</span>' : ''}
                    </div>
                    <div class="whatsapp-actions">
                        <button class="btn-icon" onclick="editWhatsApp('${number.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon" onclick="toggleWhatsAppStatus('${number.id}')">
                            <i class="fas ${number.is_active ? 'fa-eye-slash' : 'fa-eye'}"></i>
                        </button>
                        <button class="btn-icon" onclick="confirmDelete('${number.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                
                <div class="whatsapp-details">
                    <div class="detail-row">
                        <i class="fas fa-phone"></i>
                        <span>${number.whatsapp_number}</span>
                        <button class="btn-icon btn-copy" onclick="copyToClipboard('${number.whatsapp_number}')">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                    
                    ${number.display_name ? `
                        <div class="detail-row">
                            <i class="fas fa-tag"></i>
                            <span>Display Name: ${number.display_name}</span>
                        </div>
                    ` : ''}
                    
                    <div class="detail-row">
                        <i class="fas fa-building"></i>
                        <span>Department: ${number.department || 'General'}</span>
                    </div>
                    
                    ${availability.weekdays ? `
                        <div class="detail-row">
                            <i class="fas fa-clock"></i>
                            <span>Weekdays: ${availability.weekdays}</span>
                        </div>
                    ` : ''}
                    
                    ${availability.weekends ? `
                        <div class="detail-row">
                            <i class="fas fa-clock"></i>
                            <span>Weekends: ${availability.weekends}</span>
                        </div>
                    ` : ''}
                    
                    ${number.auto_reply_enabled ? `
                        <div class="auto-reply">
                            <i class="fas fa-reply"></i>
                            <div>
                                <strong>Auto-reply enabled</strong>
                                <p>${number.auto_reply_message || 'No message set'}</p>
                            </div>
                        </div>
                    ` : ''}
                </div>
                
                <div class="whatsapp-footer">
                    <div class="qr-section">
                        <button class="btn-link" onclick="showQRCode('${number.whatsapp_number}')">
                            <i class="fas fa-qrcode"></i> Show QR Code
                        </button>
                        <button class="btn-link" onclick="testWhatsApp('${number.whatsapp_number}')">
                            <i class="fas fa-paper-plane"></i> Test
                        </button>
                    </div>
                    <span class="date-added">Added: ${new Date(number.created_at).toLocaleDateString()}</span>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// ============================================
// LOAD TEMPLATES
// ============================================
async function loadTemplates() {
    try {
        const { data, error } = await sb
            .from('message_templates')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('usage_count', { ascending: false });
            
        if (error) throw error;
        
        templates = data || [];
        renderTemplates();
        
    } catch (error) {
        console.error('Error loading templates:', error);
    }
}

// ============================================
// RENDER TEMPLATES
// ============================================
function renderTemplates() {
    const container = document.getElementById('templatesList');
    
    if (templates.length === 0) {
        container.innerHTML = `
            <div class="empty-state small">
                <i class="fas fa-reply-all"></i>
                <p>No templates yet</p>
                <button class="btn-link" onclick="document.getElementById('addTemplateBtn').click()">
                    Create your first template
                </button>
            </div>
        `;
        return;
    }
    
    let html = '';
    templates.slice(0, 5).forEach(template => {
        html += `
            <div class="template-item">
                <div class="template-header">
                    <h4>${template.title}</h4>
                    <span class="template-category">${template.category || 'General'}</span>
                </div>
                <p class="template-preview">${template.content.substring(0, 60)}...</p>
                <div class="template-footer">
                    <span class="usage-count">Used ${template.usage_count || 0} times</span>
                    <div class="template-actions">
                        <button class="btn-icon" onclick="useTemplate('${template.id}')">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                        <button class="btn-icon" onclick="editTemplate('${template.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    if (templates.length > 5) {
        html += `
            <div class="view-more">
                <a href="supplier-templates.html">View all templates (${templates.length})</a>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// ============================================
// LOAD RECENT CONVERSATIONS
// ============================================
async function loadRecentConversations() {
    try {
        const { data, error } = await sb
            .from('conversations')
            .select(`
                id,
                last_message_preview,
                last_message_at,
                participant_one_id,
                participant_two_id,
                profiles!conversations_participant_one_id_fkey(full_name, business_name),
                messages(count)
            `)
            .or(`participant_one_id.eq.${currentUser.id},participant_two_id.eq.${currentUser.id}`)
            .order('last_message_at', { ascending: false })
            .limit(5);
            
        if (error) throw error;
        
        renderRecentConversations(data || []);
        
    } catch (error) {
        console.error('Error loading conversations:', error);
    }
}

// ============================================
// RENDER RECENT CONVERSATIONS
// ============================================
function renderRecentConversations(conversations) {
    const container = document.getElementById('recentConversations');
    
    if (conversations.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-comments"></i>
                <p>No conversations yet</p>
                <p class="hint">Conversations will appear here when customers contact you</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    conversations.forEach(conv => {
        const otherParticipant = conv.participant_one_id === currentUser.id 
            ? conv.profiles 
            : conv.profiles;
            
        const participantName = otherParticipant?.business_name || otherParticipant?.full_name || 'Customer';
        
        html += `
            <a href="supplier-conversation.html?id=${conv.id}" class="conversation-item">
                <div class="conversation-avatar">
                    ${participantName.charAt(0).toUpperCase()}
                </div>
                <div class="conversation-details">
                    <div class="conversation-header">
                        <h4>${participantName}</h4>
                        <span class="conversation-time">
                            ${formatTimeAgo(conv.last_message_at)}
                        </span>
                    </div>
                    <p class="conversation-preview">${conv.last_message_preview || 'No messages yet'}</p>
                </div>
            </a>
        `;
    });
    
    container.innerHTML = html;
}

// ============================================
// LOAD STATS
// ============================================
async function loadStats() {
    try {
        // Update active WhatsApp count
        document.getElementById('activeWhatsappCount').textContent = 
            whatsappNumbers.filter(w => w.is_active).length;
        
        // Get conversations count
        const { count: conversationsCount } = await sb
            .from('conversations')
            .select('*', { count: 'exact', head: true })
            .or(`participant_one_id.eq.${currentUser.id},participant_two_id.eq.${currentUser.id}`)
            .gte('last_message_at', new Date(new Date().setDate(1)).toISOString());
            
        document.getElementById('conversationsCount').textContent = conversationsCount || 0;
        
        // Get response time from supplier record
        if (currentSupplier.response_time_hours) {
            document.getElementById('avgResponseTime').textContent = 
                `${currentSupplier.response_time_hours} min`;
        }
        
        // Get response rate
        if (currentSupplier.completion_rate) {
            document.getElementById('responseRate').textContent = 
                `${currentSupplier.completion_rate}%`;
        }
        
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// ============================================
// WHATSAPP CRUD OPERATIONS
// ============================================
async function saveWhatsApp() {
    const id = document.getElementById('editId').value;
    const countryCode = document.getElementById('modalCountryCode').value;
    const number = document.getElementById('modalWhatsappNumber').value.trim();
    const label = document.getElementById('modalLabel').value.trim();
    const department = document.getElementById('modalDepartment').value;
    const displayName = document.getElementById('modalDisplayName').value.trim();
    const isPrimary = document.getElementById('modalIsPrimary').checked;
    const autoReplyEnabled = document.getElementById('modalAutoReply').checked;
    const autoReplyMessage = document.getElementById('modalAutoReplyMessage').value.trim();
    const weekdayHours = document.getElementById('modalWeekdayHours').value;
    const weekendHours = document.getElementById('modalWeekendHours').value;
    
    // Validate
    if (!number) {
        showFieldError('modalWhatsappNumber', 'WhatsApp number is required');
        return;
    }
    
    if (!/^[0-9]{7,12}$/.test(number)) {
        showFieldError('modalWhatsappNumber', 'Enter a valid number (7-12 digits)');
        return;
    }
    
    if (!label) {
        showFieldError('modalLabel', 'Label is required');
        return;
    }
    
    const fullNumber = countryCode + number;
    
    // If setting as primary, update all others to non-primary
    if (isPrimary) {
        await sb
            .from('supplier_whatsapp')
            .update({ is_primary: false })
            .eq('supplier_id', currentSupplier.id);
    }
    
    const data = {
        supplier_id: currentSupplier.id,
        whatsapp_number: fullNumber,
        label: label,
        department: department,
        display_name: displayName || null,
        is_primary: isPrimary,
        is_active: true,
        auto_reply_enabled: autoReplyEnabled,
        auto_reply_message: autoReplyEnabled ? autoReplyMessage : null,
        availability_hours: {
            weekdays: weekdayHours || null,
            weekends: weekendHours || null
        },
        updated_at: new Date().toISOString()
    };
    
    try {
        showLoading(true, id ? 'Updating...' : 'Adding...');
        
        if (id) {
            // Update existing
            const { error } = await sb
                .from('supplier_whatsapp')
                .update(data)
                .eq('id', id);
                
            if (error) throw error;
            showToast('WhatsApp number updated successfully', 'success');
            
        } else {
            // Insert new
            data.created_at = new Date().toISOString();
            const { error } = await sb
                .from('supplier_whatsapp')
                .insert(data);
                
            if (error) throw error;
            showToast('WhatsApp number added successfully', 'success');
        }
        
        closeModal();
        await loadWhatsAppNumbers();
        await loadStats();
        
    } catch (error) {
        console.error('Error saving WhatsApp:', error);
        showToast(error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function editWhatsApp(id) {
    const number = whatsappNumbers.find(w => w.id === id);
    if (!number) return;
    
    document.getElementById('modalTitle').textContent = 'Edit WhatsApp Number';
    document.getElementById('editId').value = number.id;
    
    // Extract country code and number
    const match = number.whatsapp_number.match(/^(\+\d+)(\d+)$/);
    if (match) {
        document.getElementById('modalCountryCode').value = match[1];
        document.getElementById('modalWhatsappNumber').value = match[2];
    } else {
        document.getElementById('modalWhatsappNumber').value = number.whatsapp_number;
    }
    
    document.getElementById('modalLabel').value = number.label || '';
    document.getElementById('modalDepartment').value = number.department || 'sales';
    document.getElementById('modalDisplayName').value = number.display_name || '';
    document.getElementById('modalIsPrimary').checked = number.is_primary || false;
    document.getElementById('modalAutoReply').checked = number.auto_reply_enabled || false;
    document.getElementById('modalAutoReplyMessage').value = number.auto_reply_message || '';
    
    const hours = number.availability_hours || {};
    document.getElementById('modalWeekdayHours').value = hours.weekdays || '';
    document.getElementById('modalWeekendHours').value = hours.weekends || '';
    
    document.getElementById('autoReplyField').style.display = 
        number.auto_reply_enabled ? 'block' : 'none';
    
    openModal();
}

async function toggleWhatsAppStatus(id) {
    const number = whatsappNumbers.find(w => w.id === id);
    if (!number) return;
    
    try {
        const { error } = await sb
            .from('supplier_whatsapp')
            .update({ 
                is_active: !number.is_active,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);
            
        if (error) throw error;
        
        showToast(`WhatsApp number ${number.is_active ? 'deactivated' : 'activated'}`, 'success');
        await loadWhatsAppNumbers();
        await loadStats();
        
    } catch (error) {
        console.error('Error toggling status:', error);
        showToast(error.message, 'error');
    }
}

function confirmDelete(id) {
    deleteId = id;
    openDeleteModal();
}

async function deleteWhatsApp() {
    if (!deleteId) return;
    
    try {
        showLoading(true, 'Deleting...');
        
        const { error } = await sb
            .from('supplier_whatsapp')
            .delete()
            .eq('id', deleteId);
            
        if (error) throw error;
        
        showToast('WhatsApp number deleted successfully', 'success');
        closeDeleteModal();
        await loadWhatsAppNumbers();
        await loadStats();
        
    } catch (error) {
        console.error('Error deleting:', error);
        showToast(error.message, 'error');
    } finally {
        showLoading(false);
        deleteId = null;
    }
}

// ============================================
// TEMPLATE FUNCTIONS
// ============================================
async function saveTemplate() {
    const title = document.getElementById('templateTitle').value.trim();
    const message = document.getElementById('templateMessage').value.trim();
    const category = document.getElementById('templateCategory').value;
    
    if (!title || !message) {
        showToast('Title and message are required', 'error');
        return;
    }
    
    try {
        showLoading(true, 'Saving template...');
        
        const { error } = await sb
            .from('message_templates')
            .insert({
                user_id: currentUser.id,
                title: title,
                content: message,
                category: category,
                usage_count: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
            
        if (error) throw error;
        
        showToast('Template saved successfully', 'success');
        closeTemplateModal();
        await loadTemplates();
        
    } catch (error) {
        console.error('Error saving template:', error);
        showToast(error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!', 'success');
    }).catch(() => {
        showToast('Failed to copy', 'error');
    });
}

function testWhatsApp(number) {
    const testMessage = encodeURIComponent('Hello, this is a test message from your iBlue B2B dashboard.');
    window.open(`https://wa.me/${number.replace(/\D/g, '')}?text=${testMessage}`, '_blank');
}

function showQRCode(number) {
    // You can implement QR code generation here
    showToast('QR code feature coming soon!', 'info');
}

function useTemplate(id) {
    const template = templates.find(t => t.id === id);
    if (template) {
        // Increment usage count
        sb
            .from('message_templates')
            .update({ usage_count: (template.usage_count || 0) + 1 })
            .eq('id', id)
            .then();
            
        showToast('Template ready to use!', 'success');
        // You can redirect to conversation page or open chat
    }
}

function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffSeconds = Math.floor((now - date) / 1000);
    
    if (diffSeconds < 60) return 'just now';
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} min ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)} hours ago`;
    return date.toLocaleDateString();
}

// ============================================
// MODAL FUNCTIONS
// ============================================
function setupEventListeners() {
    document.getElementById('addWhatsAppBtn').addEventListener('click', () => {
        document.getElementById('modalTitle').textContent = 'Add WhatsApp Number';
        document.getElementById('editId').value = '';
        document.getElementById('whatsappForm').reset();
        document.getElementById('autoReplyField').style.display = 'none';
        openModal();
    });
    
    document.getElementById('addTemplateBtn').addEventListener('click', () => {
        document.getElementById('templateForm').reset();
        openTemplateModal();
    });
    
    document.getElementById('refreshWhatsapp').addEventListener('click', loadWhatsAppNumbers);
    
    document.getElementById('saveWhatsappBtn').addEventListener('click', saveWhatsApp);
    
    document.getElementById('saveTemplateBtn').addEventListener('click', saveTemplate);
    
    document.getElementById('confirmDeleteBtn').addEventListener('click', deleteWhatsApp);
    
    document.getElementById('modalAutoReply').addEventListener('change', function() {
        document.getElementById('autoReplyField').style.display = 
            this.checked ? 'block' : 'none';
    });
    
    // Close modal buttons
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            closeModal();
            closeTemplateModal();
            closeDeleteModal();
        });
    });
}

function openModal() {
    document.getElementById('whatsappModal').classList.add('show');
}

function closeModal() {
    document.getElementById('whatsappModal').classList.remove('show');
    document.getElementById('whatsappForm').reset();
    document.getElementById('autoReplyField').style.display = 'none';
}

function openTemplateModal() {
    document.getElementById('templateModal').classList.add('show');
}

function closeTemplateModal() {
    document.getElementById('templateModal').classList.remove('show');
}

function openDeleteModal() {
    document.getElementById('deleteModal').classList.add('show');
}

function closeDeleteModal() {
    document.getElementById('deleteModal').classList.remove('show');
    deleteId = null;
}

// ============================================
// UTILITIES
// ============================================
function showLoading(show, message = 'Loading...') {
    const overlay = document.getElementById('loadingOverlay');
    const messageEl = document.querySelector('#loadingOverlay p');
    
    if (overlay) {
        if (messageEl) messageEl.textContent = message;
        overlay.classList.toggle('show', show);
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

function showFieldError(fieldId, message) {
    const errorEl = document.getElementById(fieldId.replace('modal', '') + 'Error');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.add('show');
        setTimeout(() => errorEl.classList.remove('show'), 3000);
    }
}