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
let currentUserProfile = null;
let myTemplates = [];
let globalTemplates = [];
let favorites = [];
let currentTemplate = null;
let currentTab = 'my-templates';
let sortOrder = 'usage';

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await loadUserProfile();
    await loadTemplates();
    setupEventListeners();
    updateCharCounters();
});

// ============================================
// AUTHENTICATION
// ============================================
async function checkAuth() {
    try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) {
            window.location.href = 'login.html?redirect=message-templates.html';
            return;
        }
        currentUser = user;
    } catch (error) {
        console.error('Auth error:', error);
        window.location.href = 'login.html';
    }
}

async function loadUserProfile() {
    try {
        const { data, error } = await sb
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();
            
        if (error) throw error;
        currentUserProfile = data;
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

// ============================================
// LOAD TEMPLATES
// ============================================
async function loadTemplates() {
    showLoading(true);
    
    try {
        // Load user's personal templates
        const { data: personal, error: personalError } = await sb
            .from('message_templates')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('usage_count', { ascending: false });
            
        if (personalError) throw personalError;
        
        myTemplates = personal || [];
        
        // Load global templates
        const { data: global, error: globalError } = await sb
            .from('message_templates')
            .select('*')
            .eq('is_global', true)
            .order('usage_count', { ascending: false });
            
        if (globalError) throw globalError;
        
        globalTemplates = global || [];
        
        // Load favorites
        favorites = [...myTemplates, ...globalTemplates].filter(t => t.is_favorite);
        
        // Render all views
        renderMyTemplates();
        renderGlobalTemplates();
        renderFavorites();
        renderCategories();
        updateStats();
        
    } catch (error) {
        console.error('Error loading templates:', error);
        showToast('Failed to load templates');
    } finally {
        showLoading(false);
    }
}

// ============================================
// RENDER FUNCTIONS
// ============================================
function renderMyTemplates() {
    const grid = document.getElementById('myTemplatesGrid');
    const empty = document.getElementById('myTemplatesEmpty');
    
    if (!grid) return;
    
    let filtered = filterTemplates(myTemplates, 'my');
    
    if (filtered.length === 0) {
        grid.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    
    empty.style.display = 'none';
    
    grid.innerHTML = filtered.map(template => createTemplateCard(template, 'personal')).join('');
}

function renderGlobalTemplates() {
    const grid = document.getElementById('globalTemplatesGrid');
    
    if (!grid) return;
    
    let filtered = filterTemplates(globalTemplates, 'global');
    
    if (filtered.length === 0) {
        grid.innerHTML = '<div class="empty-state"><p>No global templates available</p></div>';
        return;
    }
    
    grid.innerHTML = filtered.map(template => createTemplateCard(template, 'global')).join('');
}

function renderFavorites() {
    const grid = document.getElementById('favoritesGrid');
    const empty = document.getElementById('favoritesEmpty');
    
    if (!grid) return;
    
    if (favorites.length === 0) {
        grid.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    
    empty.style.display = 'none';
    
    grid.innerHTML = favorites.map(template => createTemplateCard(template, 'favorite')).join('');
}

function renderCategories() {
    const container = document.getElementById('categoryItems');
    
    const categories = [
        { name: 'Greeting', color: '#EFF6FF', icon: 'fa-hand-wave', count: countByCategory('greeting') },
        { name: 'Price Quote', color: '#E7F5E8', icon: 'fa-tag', count: countByCategory('price') },
        { name: 'Shipping', color: '#FFF3E0', icon: 'fa-truck', count: countByCategory('shipping') },
        { name: 'Payment', color: '#F3E8FF', icon: 'fa-credit-card', count: countByCategory('payment') },
        { name: 'Quality', color: '#FFE4E6', icon: 'fa-star', count: countByCategory('quality') },
        { name: 'Negotiation', color: '#E0F2FE', icon: 'fa-handshake', count: countByCategory('negotiation') },
        { name: 'Closing', color: '#D1FAE5', icon: 'fa-check-circle', count: countByCategory('closing') },
        { name: 'Follow-up', color: '#FEF3C7', icon: 'fa-clock', count: countByCategory('followup') },
        { name: 'Support', color: '#FCE7F3', icon: 'fa-headset', count: countByCategory('support') },
        { name: 'Other', color: '#E5E7EB', icon: 'fa-folder', count: countByCategory('other') }
    ];
    
    container.innerHTML = categories.map(cat => `
        <div class="category-item" onclick="filterByCategory('${cat.name.toLowerCase()}')">
            <div class="category-info">
                <div class="category-color" style="background: ${cat.color}; color: ${getContrastColor(cat.color)};">
                    <i class="fas ${cat.icon}"></i>
                </div>
                <div class="category-details">
                    <h4>${cat.name}</h4>
                    <p>${cat.count} template${cat.count !== 1 ? 's' : ''}</p>
                </div>
            </div>
            <span class="category-count">${cat.count}</span>
        </div>
    `).join('');
}

function createTemplateCard(template, type) {
    const usagePercent = Math.min((template.usage_count / 100) * 100, 100);
    const categoryClass = template.category || 'other';
    
    return `
        <div class="template-card ${type === 'global' ? 'global' : ''}" 
             onclick="openTemplate(${template.id})"
             data-template-id="${template.id}">
            <div class="template-header">
                <span class="template-category ${categoryClass}">${formatCategory(template.category)}</span>
                <div class="template-actions" onclick="event.stopPropagation()">
                    <button class="action-btn favorite ${template.is_favorite ? 'active' : ''}" 
                            onclick="toggleFavorite(${template.id})">
                        <i class="fa${template.is_favorite ? 's' : 'r'} fa-star"></i>
                    </button>
                    <button class="action-btn" onclick="editTemplate(${template.id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn" onclick="deleteTemplate(${template.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <h3 class="template-title">${escapeHtml(template.title)}</h3>
            <div class="template-preview">${escapeHtml(truncate(template.content, 100))}</div>
            <div class="template-footer">
                <div class="template-stats">
                    <span class="stat-item">
                        <i class="fas fa-chart-line"></i> ${template.usage_count || 0}
                    </span>
                    <span class="stat-item">
                        <i class="far fa-clock"></i> ${moment(template.updated_at).fromNow()}
                    </span>
                </div>
                <div class="usage-bar">
                    <div class="usage-fill" style="width: ${usagePercent}%"></div>
                </div>
            </div>
        </div>
    `;
}

function updateStats() {
    const allTemplates = [...myTemplates, ...globalTemplates];
    
    document.getElementById('totalTemplates').textContent = allTemplates.length;
    document.getElementById('totalCategories').textContent = countCategories();
    
    // Find most used category
    const categoryUsage = {};
    allTemplates.forEach(t => {
        categoryUsage[t.category] = (categoryUsage[t.category] || 0) + 1;
    });
    
    let mostUsed = Object.entries(categoryUsage).sort((a, b) => b[1] - a[1])[0];
    document.getElementById('mostUsedCategory').textContent = mostUsed ? formatCategory(mostUsed[0]) : '-';
    
    // Render simple chart
    renderUsageChart(categoryUsage);
}

function renderUsageChart(categoryUsage) {
    const chart = document.getElementById('usageChart');
    const maxCount = Math.max(...Object.values(categoryUsage), 1);
    
    const sortedCategories = Object.entries(categoryUsage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    
    chart.innerHTML = sortedCategories.map(([cat, count]) => {
        const percentage = (count / maxCount) * 100;
        return `
            <div style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <span style="font-size: 13px;">${formatCategory(cat)}</span>
                    <span style="font-size: 13px; font-weight: 600;">${count}</span>
                </div>
                <div style="height: 8px; background: var(--gray-200); border-radius: 4px; overflow: hidden;">
                    <div style="height: 100%; width: ${percentage}%; background: var(--primary); border-radius: 4px;"></div>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// FILTER FUNCTIONS
// ============================================
function filterTemplates(templates, type) {
    const searchInput = document.getElementById(type === 'my' ? 'searchMyTemplates' : 'searchGlobalTemplates');
    const categoryFilter = document.getElementById(type === 'my' ? 'filterMyCategory' : 'filterGlobalCategory');
    
    const searchTerm = searchInput?.value.toLowerCase() || '';
    const category = categoryFilter?.value || '';
    
    let filtered = templates;
    
    if (searchTerm) {
        filtered = filtered.filter(t => 
            t.title.toLowerCase().includes(searchTerm) || 
            t.content.toLowerCase().includes(searchTerm)
        );
    }
    
    if (category) {
        filtered = filtered.filter(t => t.category === category);
    }
    
    if (sortOrder === 'usage') {
        filtered.sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
    } else if (sortOrder === 'alphabetical') {
        filtered.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortOrder === 'recent') {
        filtered.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    }
    
    return filtered;
}

// ============================================
// TEMPLATE CRUD OPERATIONS
// ============================================
window.openTemplate = function(templateId) {
    const template = [...myTemplates, ...globalTemplates].find(t => t.id === templateId);
    if (template) {
        // Open template details or use it
        document.getElementById('messageInput').value = template.content;
        showToast('Template inserted into message');
    }
};

window.editTemplate = function(templateId) {
    const template = myTemplates.find(t => t.id === templateId);
    if (!template) return;
    
    currentTemplate = template;
    
    document.getElementById('modalTitle').textContent = 'Edit Template';
    document.getElementById('templateTitle').value = template.title;
    document.getElementById('templateCategory').value = template.category || '';
    document.getElementById('templateContent').value = template.content;
    document.getElementById('templateIsFavorite').checked = template.is_favorite || false;
    
    updateCharCounters();
    updatePreview();
    
    document.getElementById('templateModal').classList.add('show');
};

window.deleteTemplate = function(templateId) {
    const template = myTemplates.find(t => t.id === templateId);
    if (!template) return;
    
    currentTemplate = template;
    document.getElementById('deleteTemplateName').textContent = template.title;
    document.getElementById('deleteModal').classList.add('show');
};

async function confirmDelete() {
    if (!currentTemplate) return;
    
    try {
        const { error } = await sb
            .from('message_templates')
            .delete()
            .eq('id', currentTemplate.id);
            
        if (error) throw error;
        
        // Remove from local arrays
        myTemplates = myTemplates.filter(t => t.id !== currentTemplate.id);
        favorites = favorites.filter(t => t.id !== currentTemplate.id);
        
        // Refresh views
        renderMyTemplates();
        renderFavorites();
        renderCategories();
        updateStats();
        
        showToast('Template deleted successfully');
        closeDeleteModal();
        
    } catch (error) {
        console.error('Error deleting template:', error);
        showToast('Failed to delete template');
    }
}

async function saveTemplate() {
    const title = document.getElementById('templateTitle').value;
    const category = document.getElementById('templateCategory').value;
    const content = document.getElementById('templateContent').value;
    const isFavorite = document.getElementById('templateIsFavorite').checked;
    
    if (!title || !category || !content) {
        showToast('Please fill all required fields');
        return;
    }
    
    const templateData = {
        user_id: currentUser.id,
        title: title.trim(),
        category: category,
        content: content.trim(),
        is_favorite: isFavorite,
        updated_at: new Date().toISOString()
    };
    
    try {
        let result;
        
        if (currentTemplate) {
            // Update existing
            result = await sb
                .from('message_templates')
                .update(templateData)
                .eq('id', currentTemplate.id);
        } else {
            // Create new
            templateData.created_at = new Date().toISOString();
            templateData.usage_count = 0;
            
            result = await sb
                .from('message_templates')
                .insert(templateData);
        }
        
        if (result.error) throw result.error;
        
        showToast(currentTemplate ? 'Template updated' : 'Template created');
        closeTemplateModal();
        await loadTemplates();
        
    } catch (error) {
        console.error('Error saving template:', error);
        showToast('Failed to save template');
    }
}

window.toggleFavorite = async function(templateId) {
    const template = [...myTemplates, ...globalTemplates].find(t => t.id === templateId);
    if (!template) return;
    
    const newFavoriteState = !template.is_favorite;
    
    try {
        const { error } = await sb
            .from('message_templates')
            .update({ is_favorite: newFavoriteState })
            .eq('id', templateId);
            
        if (error) throw error;
        
        // Update local state
        template.is_favorite = newFavoriteState;
        
        if (newFavoriteState) {
            if (!favorites.find(t => t.id === templateId)) {
                favorites.push(template);
            }
        } else {
            favorites = favorites.filter(t => t.id !== templateId);
        }
        
        // Refresh views
        renderMyTemplates();
        renderGlobalTemplates();
        renderFavorites();
        
        showToast(newFavoriteState ? 'Added to favorites' : 'Removed from favorites');
        
    } catch (error) {
        console.error('Error toggling favorite:', error);
        showToast('Failed to update favorite');
    }
};

// ============================================
// VARIABLE INSERTION
// ============================================
window.insertVariable = function(variable) {
    const textarea = document.getElementById('templateContent');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    
    textarea.value = text.substring(0, start) + variable + text.substring(end);
    textarea.focus();
    textarea.setSelectionRange(start + variable.length, start + variable.length);
    
    updateCharCounters();
    updatePreview();
};

// ============================================
// PREVIEW FUNCTION
// ============================================
function updatePreview() {
    const content = document.getElementById('templateContent').value;
    const preview = document.getElementById('templatePreview');
    
    // Replace variables with example values for preview
    let previewText = content
        .replace(/{buyer_name}/g, '[Buyer Name]')
        .replace(/{company_name}/g, '[Your Company]')
        .replace(/{product_name}/g, '[Product]')
        .replace(/{inquiry_number}/g, 'INQ-001')
        .replace(/{quote_number}/g, 'QTE-001')
        .replace(/{order_number}/g, 'PO-001');
    
    preview.textContent = previewText || 'Your message will appear here...';
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function formatCategory(category) {
    const categories = {
        'greeting': 'Greeting',
        'price': 'Price Quote',
        'shipping': 'Shipping',
        'payment': 'Payment',
        'quality': 'Quality',
        'negotiation': 'Negotiation',
        'closing': 'Closing',
        'followup': 'Follow-up',
        'support': 'Support',
        'other': 'Other'
    };
    return categories[category] || category || 'Other';
}

function countByCategory(category) {
    return [...myTemplates, ...globalTemplates].filter(t => t.category === category).length;
}

function countCategories() {
    const categories = new Set([...myTemplates, ...globalTemplates].map(t => t.category));
    return categories.size;
}

function getContrastColor(hexcolor) {
    // Simple function to determine if text should be black or white
    const r = parseInt(hexcolor.substr(1,2),16);
    const g = parseInt(hexcolor.substr(3,2),16);
    const b = parseInt(hexcolor.substr(5,2),16);
    const yiq = ((r*299)+(g*587)+(b*114))/1000;
    return (yiq >= 128) ? '#000000' : '#FFFFFF';
}

function truncate(str, length) {
    if (!str) return '';
    return str.length > length ? str.substring(0, length) + '...' : str;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showLoading(show) {
    document.getElementById('loadingState').style.display = show ? 'flex' : 'none';
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function updateCharCounters() {
    const title = document.getElementById('templateTitle');
    const content = document.getElementById('templateContent');
    
    if (title) {
        document.getElementById('titleCharCount').textContent = title.value.length;
    }
    
    if (content) {
        document.getElementById('contentCharCount').textContent = content.value.length;
        updatePreview();
    }
}

// ============================================
// MODAL FUNCTIONS
// ============================================
window.showCreateTemplateModal = function() {
    currentTemplate = null;
    document.getElementById('modalTitle').textContent = 'Create New Template';
    document.getElementById('templateForm').reset();
    updateCharCounters();
    updatePreview();
    document.getElementById('templateModal').classList.add('show');
};

window.closeTemplateModal = function() {
    document.getElementById('templateModal').classList.remove('show');
};

window.closeDeleteModal = function() {
    document.getElementById('deleteModal').classList.remove('show');
    currentTemplate = null;
};

window.closeImportModal = function() {
    document.getElementById('importModal').classList.remove('show');
};

window.closeStatsModal = function() {
    document.getElementById('statsModal').classList.remove('show');
};

window.closeExportModal = function() {
    document.getElementById('exportModal').classList.remove('show');
};

// ============================================
// EXPORT/IMPORT FUNCTIONS
// ============================================
window.exportTemplates = function(format) {
    const data = myTemplates.map(t => ({
        title: t.title,
        category: t.category,
        content: t.content,
        is_favorite: t.is_favorite
    }));
    
    if (format === 'csv') {
        // Convert to CSV
        const headers = ['Title', 'Category', 'Content', 'Favorite'];
        const csvContent = [
            headers.join(','),
            ...data.map(t => [
                `"${t.title}"`,
                t.category,
                `"${t.content.replace(/"/g, '""')}"`,
                t.is_favorite
            ].join(','))
        ].join('\n');
        
        downloadFile(csvContent, 'templates.csv', 'text/csv');
        
    } else if (format === 'json') {
        const jsonContent = JSON.stringify(data, null, 2);
        downloadFile(jsonContent, 'templates.json', 'application/json');
        
    } else if (format === 'pdf') {
        showToast('PDF export coming soon');
    }
    
    closeExportModal();
};

function downloadFile(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            currentTab = btn.dataset.tab;
            
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(currentTab).classList.add('active');
        });
    });
    
    // Search inputs
    document.getElementById('searchMyTemplates')?.addEventListener('input', () => renderMyTemplates());
    document.getElementById('searchGlobalTemplates')?.addEventListener('input', () => renderGlobalTemplates());
    
    // Category filters
    document.getElementById('filterMyCategory')?.addEventListener('change', () => renderMyTemplates());
    document.getElementById('filterGlobalCategory')?.addEventListener('change', () => renderGlobalTemplates());
    
    // Sort buttons
    document.getElementById('sortMyTemplates')?.addEventListener('click', () => {
        sortOrder = sortOrder === 'usage' ? 'alphabetical' : 'usage';
        renderMyTemplates();
    });
    
    document.getElementById('sortGlobalTemplates')?.addEventListener('click', () => {
        sortOrder = sortOrder === 'usage' ? 'alphabetical' : 'usage';
        renderGlobalTemplates();
    });
    
    // New template button
    document.getElementById('newTemplateBtn')?.addEventListener('click', showCreateTemplateModal);
    
    // Form inputs
    document.getElementById('templateTitle')?.addEventListener('input', updateCharCounters);
    document.getElementById('templateContent')?.addEventListener('input', updateCharCounters);
    
    // Import functionality
    document.getElementById('importFileArea')?.addEventListener('click', () => {
        document.getElementById('importFile').click();
    });
    
    document.getElementById('importFile')?.addEventListener('change', handleFileImport);
    
    // Confirm delete
    document.getElementById('confirmDeleteBtn')?.addEventListener('click', confirmDelete);
    
    // Close modals on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeTemplateModal();
                closeDeleteModal();
                closeImportModal();
                closeStatsModal();
                closeExportModal();
            }
        });
    });
}

function handleFileImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = async (event) => {
        try {
            let templates = [];
            
            if (file.name.endsWith('.json')) {
                templates = JSON.parse(event.target.result);
            } else if (file.name.endsWith('.csv')) {
                // Parse CSV (simplified)
                const lines = event.target.result.split('\n');
                const headers = lines[0].split(',');
                
                for (let i = 1; i < lines.length; i++) {
                    const values = lines[i].split(',');
                    if (values.length >= 3) {
                        templates.push({
                            title: values[0].replace(/"/g, ''),
                            category: values[1].replace(/"/g, ''),
                            content: values[2].replace(/"/g, ''),
                            is_favorite: values[3] === 'true'
                        });
                    }
                }
            }
            
            // Import templates
            for (const t of templates) {
                await sb
                    .from('message_templates')
                    .insert({
                        user_id: currentUser.id,
                        title: t.title,
                        category: t.category,
                        content: t.content,
                        is_favorite: t.is_favorite || false,
                        usage_count: 0,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });
            }
            
            showToast(`Imported ${templates.length} templates`);
            closeImportModal();
            await loadTemplates();
            
        } catch (error) {
            console.error('Error importing templates:', error);
            showToast('Failed to import templates');
        }
    };
    
    reader.readAsText(file);
}

// Make functions globally available
window.openTemplate = openTemplate;
window.editTemplate = editTemplate;
window.deleteTemplate = deleteTemplate;
window.toggleFavorite = toggleFavorite;
window.insertVariable = insertVariable;
window.showCreateTemplateModal = showCreateTemplateModal;
window.closeTemplateModal = closeTemplateModal;
window.closeDeleteModal = closeDeleteModal;
window.closeImportModal = closeImportModal;
window.closeStatsModal = closeStatsModal;
window.closeExportModal = closeExportModal;
window.exportTemplates = exportTemplates;
window.filterByCategory = (category) => {
    // Switch to my templates tab and set filter
    document.querySelector('[data-tab="my-templates"]').click();
    document.getElementById('filterMyCategory').value = category;
    renderMyTemplates();
};