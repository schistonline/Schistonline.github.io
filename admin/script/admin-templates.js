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
let templates = [];
let filteredTemplates = [];
let selectedTemplates = new Set();
let currentTemplate = null;
let usageChart = null;

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await checkAdminStatus();
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
            window.location.href = 'login.html?redirect=admin-templates.html';
            return;
        }
        currentUser = user;
    } catch (error) {
        console.error('Auth error:', error);
        window.location.href = 'login.html';
    }
}

async function checkAdminStatus() {
    try {
        const { data, error } = await sb
            .from('profiles')
            .select('is_admin, admin_role')
            .eq('id', currentUser.id)
            .single();
            
        if (error) throw error;
        
        if (!data.is_admin) {
            showToast('Admin access required');
            setTimeout(() => window.location.href = 'index.html', 2000);
        }
    } catch (error) {
        console.error('Error checking admin status:', error);
        window.location.href = 'index.html';
    }
}

// ============================================
// LOAD TEMPLATES
// ============================================
async function loadTemplates() {
    showLoading(true);
    
    try {
        const { data, error } = await sb
            .from('message_templates')
            .select(`
                *,
                profiles!message_templates_user_id_fkey (
                    id,
                    full_name,
                    business_name,
                    email,
                    avatar_url
                )
            `)
            .order('created_at', { ascending: false });
            
        if (error) throw error;
        
        templates = data || [];
        filteredTemplates = [...templates];
        
        updateStats();
        renderTemplatesTable();
        
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
function renderTemplatesTable() {
    const tbody = document.getElementById('templatesTableBody');
    const container = document.getElementById('templatesContainer');
    const emptyState = document.getElementById('emptyState');
    
    if (filteredTemplates.length === 0) {
        container.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    container.style.display = 'block';
    emptyState.style.display = 'none';
    
    tbody.innerHTML = filteredTemplates.map(template => {
        const creator = template.profiles || {};
        const creatorName = creator.business_name || creator.full_name || 'System';
        const creatorInitials = getInitials(creatorName);
        const usagePercent = Math.min((template.usage_count / 100) * 100, 100);
        const isSelected = selectedTemplates.has(template.id);
        
        return `
            <tr class="${isSelected ? 'selected' : ''}">
                <td>
                    <div class="template-title">${escapeHtml(template.title)}</div>
                    <div class="template-meta">ID: ${template.id}</div>
                </td>
                <td>
                    <span class="category-badge ${template.category || 'other'}">${formatCategory(template.category)}</span>
                </td>
                <td>
                    <div class="content-preview" title="${escapeHtml(template.content)}">
                        ${escapeHtml(truncate(template.content, 100))}
                    </div>
                </td>
                <td>
                    <span class="type-badge ${template.is_global ? 'global' : 'personal'}">
                        ${template.is_global ? 'Global' : 'Personal'}
                    </span>
                </td>
                <td>
                    <div class="created-by">
                        <div class="created-by-avatar">
                            ${creator.avatar_url ? 
                                `<img src="${creator.avatar_url}" alt="${creatorName}" style="width:100%; height:100%; object-fit:cover;">` : 
                                creatorInitials
                            }
                        </div>
                        <div>
                            <div class="created-by-name">${escapeHtml(creatorName)}</div>
                            <div class="created-by-email">${creator.email || ''}</div>
                        </div>
                    </div>
                </td>
                <td class="usage-cell">
                    <span class="usage-number">${template.usage_count || 0}</span>
                    <div class="usage-bar">
                        <div class="usage-fill" style="width: ${usagePercent}%"></div>
                    </div>
                </td>
                <td>${template.last_used ? formatDate(template.last_used) : 'Never'}</td>
                <td>
                    <span class="status-badge ${template.status || 'active'}">${template.status || 'active'}</span>
                </td>
                <td>
                    <div class="actions-cell">
                        <button class="action-btn" onclick="viewTemplate(${template.id})" title="View">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="action-btn" onclick="editTemplate(${template.id})" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="action-btn" onclick="duplicateTemplate(${template.id})" title="Duplicate">
                            <i class="fas fa-copy"></i>
                        </button>
                        <button class="action-btn delete" onclick="deleteTemplate(${template.id})" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function updateStats() {
    const total = templates.length;
    const global = templates.filter(t => t.is_global).length;
    const personal = templates.filter(t => !t.is_global).length;
    const totalUsage = templates.reduce((sum, t) => sum + (t.usage_count || 0), 0);
    
    document.getElementById('totalTemplates').textContent = total;
    document.getElementById('globalTemplates').textContent = global;
    document.getElementById('personalTemplates').textContent = personal;
    document.getElementById('totalUsage').textContent = totalUsage.toLocaleString();
}

// ============================================
// TEMPLATE CRUD OPERATIONS
// ============================================
window.showCreateTemplateModal = function() {
    currentTemplate = null;
    document.getElementById('modalTitle').textContent = 'Create New Template';
    document.getElementById('templateForm').reset();
    document.getElementById('templateIsGlobal').checked = true;
    document.getElementById('templateStatus').value = 'active';
    updateCharCounters();
    updatePreview();
    document.getElementById('templateModal').classList.add('show');
};

window.editTemplate = function(templateId) {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;
    
    currentTemplate = template;
    
    document.getElementById('modalTitle').textContent = 'Edit Template';
    document.getElementById('templateTitle').value = template.title || '';
    document.getElementById('templateCategory').value = template.category || '';
    document.getElementById('templateContent').value = template.content || '';
    document.getElementById('templateLanguage').value = template.language || 'en';
    document.getElementById('templateStatus').value = template.status || 'active';
    document.getElementById('templateIsGlobal').checked = template.is_global || false;
    
    updateCharCounters();
    updatePreview();
    document.getElementById('templateModal').classList.add('show');
};

window.viewTemplate = function(templateId) {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;
    
    const creator = template.profiles || {};
    const creatorName = creator.business_name || creator.full_name || 'System';
    
    const details = document.getElementById('templateDetails');
    details.innerHTML = `
        <div class="detail-group">
            <h4>Basic Information</h4>
            <div class="detail-row">
                <span class="detail-label">Title:</span>
                <span class="detail-value">${escapeHtml(template.title)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Category:</span>
                <span class="detail-value">${formatCategory(template.category)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Type:</span>
                <span class="detail-value">${template.is_global ? 'Global' : 'Personal'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Status:</span>
                <span class="detail-value">${template.status || 'active'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Language:</span>
                <span class="detail-value">${(template.language || 'en').toUpperCase()}</span>
            </div>
        </div>
        
        <div class="detail-group">
            <h4>Creator Information</h4>
            <div class="detail-row">
                <span class="detail-label">Name:</span>
                <span class="detail-value">${escapeHtml(creatorName)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Email:</span>
                <span class="detail-value">${creator.email || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">User ID:</span>
                <span class="detail-value">${creator.id || 'System'}</span>
            </div>
        </div>
        
        <div class="detail-group">
            <h4>Usage Statistics</h4>
            <div class="detail-row">
                <span class="detail-label">Times Used:</span>
                <span class="detail-value">${template.usage_count || 0}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Last Used:</span>
                <span class="detail-value">${template.last_used ? formatDateTime(template.last_used) : 'Never'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Created:</span>
                <span class="detail-value">${formatDateTime(template.created_at)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Updated:</span>
                <span class="detail-value">${formatDateTime(template.updated_at)}</span>
            </div>
        </div>
        
        <div class="detail-group">
            <h4>Template Content</h4>
            <div class="detail-content">${escapeHtml(template.content).replace(/\n/g, '<br>')}</div>
        </div>
    `;
    
    document.getElementById('viewTemplateModal').classList.add('show');
};

window.duplicateTemplate = function(templateId) {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;
    
    currentTemplate = null;
    
    document.getElementById('modalTitle').textContent = 'Duplicate Template';
    document.getElementById('templateTitle').value = `${template.title} (Copy)`;
    document.getElementById('templateCategory').value = template.category || '';
    document.getElementById('templateContent').value = template.content || '';
    document.getElementById('templateLanguage').value = template.language || 'en';
    document.getElementById('templateStatus').value = 'active';
    document.getElementById('templateIsGlobal').checked = template.is_global || false;
    
    updateCharCounters();
    updatePreview();
    document.getElementById('templateModal').classList.add('show');
};

window.deleteTemplate = function(templateId) {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;
    
    currentTemplate = template;
    document.getElementById('deleteTemplateName').textContent = template.title;
    document.getElementById('deleteModal').classList.add('show');
};

async function saveTemplate() {
    const title = document.getElementById('templateTitle').value.trim();
    const category = document.getElementById('templateCategory').value;
    const content = document.getElementById('templateContent').value.trim();
    const language = document.getElementById('templateLanguage').value;
    const status = document.getElementById('templateStatus').value;
    const isGlobal = document.getElementById('templateIsGlobal').checked;
    
    if (!title || !category || !content) {
        showToast('Please fill all required fields');
        return;
    }
    
    const templateData = {
        title: title,
        category: category,
        content: content,
        language: language,
        status: status,
        is_global: isGlobal,
        updated_at: new Date().toISOString()
    };
    
    if (!currentTemplate) {
        templateData.user_id = currentUser.id;
        templateData.created_at = new Date().toISOString();
        templateData.usage_count = 0;
    }
    
    try {
        let result;
        
        if (currentTemplate) {
            // Update existing template
            result = await sb
                .from('message_templates')
                .update(templateData)
                .eq('id', currentTemplate.id);
        } else {
            // Create new template
            result = await sb
                .from('message_templates')
                .insert(templateData);
        }
        
        if (result.error) throw result.error;
        
        showSuccess(currentTemplate ? 'Template updated successfully' : 'Template created successfully');
        closeTemplateModal();
        await loadTemplates();
        
    } catch (error) {
        console.error('Error saving template:', error);
        showToast('Failed to save template');
    }
}

async function confirmDelete() {
    if (!currentTemplate) return;
    
    try {
        const { error } = await sb
            .from('message_templates')
            .delete()
            .eq('id', currentTemplate.id);
            
        if (error) throw error;
        
        showSuccess('Template deleted successfully');
        closeDeleteModal();
        await loadTemplates();
        
    } catch (error) {
        console.error('Error deleting template:', error);
        showToast('Failed to delete template');
    }
}

// ============================================
// BULK ACTIONS
// ============================================
function toggleSelectAll() {
    const checkboxes = document.querySelectorAll('.template-select');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    
    checkboxes.forEach(cb => cb.checked = !allChecked);
    updateSelectedTemplates();
}

function updateSelectedTemplates() {
    selectedTemplates.clear();
    document.querySelectorAll('.template-select:checked').forEach(cb => {
        selectedTemplates.add(parseInt(cb.value));
    });
    
    document.getElementById('selectedCount').textContent = selectedTemplates.size;
}

function showBulkActions() {
    if (selectedTemplates.size === 0) {
        showToast('Please select at least one template');
        return;
    }
    document.getElementById('bulkModal').classList.add('show');
}

async function bulkAction(action) {
    if (selectedTemplates.size === 0) return;
    
    const templateIds = Array.from(selectedTemplates);
    
    try {
        let updateData = {};
        
        switch(action) {
            case 'activate':
                updateData.status = 'active';
                break;
            case 'deactivate':
                updateData.status = 'inactive';
                break;
            case 'global':
                updateData.is_global = true;
                break;
            case 'personal':
                updateData.is_global = false;
                break;
            case 'delete':
                if (!confirm(`Delete ${selectedTemplates.size} templates?`)) return;
                await sb
                    .from('message_templates')
                    .delete()
                    .in('id', templateIds);
                showSuccess(`${selectedTemplates.size} templates deleted`);
                closeBulkModal();
                await loadTemplates();
                return;
        }
        
        if (Object.keys(updateData).length > 0) {
            await sb
                .from('message_templates')
                .update(updateData)
                .in('id', templateIds);
            
            showSuccess(`${selectedTemplates.size} templates updated`);
        }
        
        closeBulkModal();
        await loadTemplates();
        
    } catch (error) {
        console.error('Error in bulk action:', error);
        showToast('Failed to perform bulk action');
    }
}

// ============================================
// IMPORT/EXPORT FUNCTIONS
// ============================================
function showImportModal() {
    document.getElementById('importModal').classList.add('show');
}

async function handleFileImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = async (event) => {
        try {
            let templates = [];
            
            if (file.name.endsWith('.json')) {
                templates = JSON.parse(event.target.result);
            } else if (file.name.endsWith('.csv')) {
                // Parse CSV
                const lines = event.target.result.split('\n');
                const headers = lines[0].split(',');
                
                for (let i = 1; i < lines.length; i++) {
                    const values = lines[i].split(',');
                    if (values.length >= 3) {
                        templates.push({
                            title: values[0].replace(/"/g, ''),
                            category: values[1].replace(/"/g, ''),
                            content: values[2].replace(/"/g, ''),
                            language: values[3]?.replace(/"/g, '') || 'en',
                            is_global: true,
                            status: 'active'
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
                        language: t.language || 'en',
                        is_global: true,
                        status: 'active',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });
            }
            
            showSuccess(`Imported ${templates.length} templates`);
            closeImportModal();
            await loadTemplates();
            
        } catch (error) {
            console.error('Error importing templates:', error);
            showToast('Failed to import templates');
        }
    };
    
    reader.readAsText(file);
}

async function duplicateCategory() {
    const category = document.getElementById('duplicateCategory').value;
    if (!category) {
        showToast('Please select a category');
        return;
    }
    
    try {
        const templatesToCopy = templates.filter(t => t.category === category && t.is_global);
        
        for (const t of templatesToCopy) {
            await sb
                .from('message_templates')
                .insert({
                    user_id: currentUser.id,
                    title: t.title,
                    category: t.category,
                    content: t.content,
                    language: t.language || 'en',
                    is_global: true,
                    status: 'active',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
        }
        
        showSuccess(`Duplicated ${templatesToCopy.length} templates`);
        closeImportModal();
        await loadTemplates();
        
    } catch (error) {
        console.error('Error duplicating category:', error);
        showToast('Failed to duplicate templates');
    }
}

function showExportModal() {
    document.getElementById('exportModal').classList.add('show');
}

function exportTemplates() {
    const category = document.getElementById('exportCategory').value;
    const type = document.getElementById('exportType').value;
    const startDate = document.getElementById('exportStartDate').value;
    const endDate = document.getElementById('exportEndDate').value;
    const format = document.querySelector('input[name="exportFormat"]:checked').value;
    
    let data = [...templates];
    
    // Apply filters
    if (category !== 'all') {
        data = data.filter(t => t.category === category);
    }
    
    if (type === 'global') {
        data = data.filter(t => t.is_global);
    } else if (type === 'personal') {
        data = data.filter(t => !t.is_global);
    }
    
    if (startDate) {
        data = data.filter(t => new Date(t.created_at) >= new Date(startDate));
    }
    
    if (endDate) {
        data = data.filter(t => new Date(t.created_at) <= new Date(endDate));
    }
    
    // Prepare export data
    const exportData = data.map(t => ({
        title: t.title,
        category: t.category,
        content: t.content,
        language: t.language,
        is_global: t.is_global,
        status: t.status,
        usage_count: t.usage_count,
        created_at: t.created_at
    }));
    
    if (format === 'csv') {
        exportToCSV(exportData);
    } else if (format === 'json') {
        exportToJSON(exportData);
    } else if (format === 'pdf') {
        exportToPDF(exportData);
    }
    
    closeExportModal();
}

function exportToCSV(data) {
    const headers = ['Title', 'Category', 'Content', 'Language', 'Global', 'Status', 'Usage', 'Created'];
    const csvContent = [
        headers.join(','),
        ...data.map(t => [
            `"${t.title}"`,
            t.category,
            `"${t.content.replace(/"/g, '""')}"`,
            t.language,
            t.is_global,
            t.status,
            t.usage_count,
            new Date(t.created_at).toLocaleDateString()
        ].join(','))
    ].join('\n');
    
    downloadFile(csvContent, 'templates_export.csv', 'text/csv');
}

function exportToJSON(data) {
    const jsonContent = JSON.stringify(data, null, 2);
    downloadFile(jsonContent, 'templates_export.json', 'application/json');
}

function exportToPDF(data) {
    // PDF export would require a library like jsPDF
    showToast('PDF export coming soon');
}

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
// STATISTICS FUNCTIONS
// ============================================
function showStatsModal() {
    renderStatsDashboard();
    document.getElementById('statsModal').classList.add('show');
}

function renderStatsDashboard() {
    const container = document.getElementById('statsDashboard');
    
    // Category distribution
    const categories = {};
    templates.forEach(t => {
        categories[t.category] = (categories[t.category] || 0) + 1;
    });
    
    // Usage by category
    const usageByCategory = {};
    templates.forEach(t => {
        usageByCategory[t.category] = (usageByCategory[t.category] || 0) + (t.usage_count || 0);
    });
    
    // Top templates
    const topTemplates = [...templates]
        .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0))
        .slice(0, 5);
    
    container.innerHTML = `
        <div class="stats-chart">
            <canvas id="categoryChart"></canvas>
        </div>
        
        <div class="stats-summary">
            <div class="summary-item">
                <span class="summary-value">${templates.length}</span>
                <span class="summary-label">Total Templates</span>
            </div>
            <div class="summary-item">
                <span class="summary-value">${templates.filter(t => t.is_global).length}</span>
                <span class="summary-label">Global Templates</span>
            </div>
            <div class="summary-item">
                <span class="summary-value">${templates.reduce((sum, t) => sum + (t.usage_count || 0), 0)}</span>
                <span class="summary-label">Total Uses</span>
            </div>
            <div class="summary-item">
                <span class="summary-value">${Object.keys(categories).length}</span>
                <span class="summary-label">Categories</span>
            </div>
        </div>
        
        <div class="detail-group">
            <h4>Most Used Templates</h4>
            ${topTemplates.map(t => `
                <div class="detail-row">
                    <span class="detail-label">${escapeHtml(t.title)}</span>
                    <span class="detail-value">${t.usage_count || 0} uses</span>
                </div>
            `).join('')}
        </div>
    `;
    
    // Create chart
    if (usageChart) {
        usageChart.destroy();
    }
    
    const ctx = document.getElementById('categoryChart').getContext('2d');
    usageChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(categories).map(c => formatCategory(c)),
            datasets: [{
                label: 'Number of Templates',
                data: Object.values(categories),
                backgroundColor: '#0B4F6C',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function showLoading(show) {
    document.getElementById('loadingState').style.display = show ? 'flex' : 'none';
    document.getElementById('templatesContainer').style.display = show ? 'none' : 'block';
}

function filterTemplates() {
    const searchTerm = document.getElementById('searchTemplates').value.toLowerCase();
    const category = document.getElementById('categoryFilter').value;
    const type = document.getElementById('typeFilter').value;
    const sortBy = document.getElementById('sortBy').value;
    
    filteredTemplates = templates.filter(t => {
        // Search filter
        if (searchTerm) {
            const matchesTitle = t.title?.toLowerCase().includes(searchTerm);
            const matchesContent = t.content?.toLowerCase().includes(searchTerm);
            if (!matchesTitle && !matchesContent) return false;
        }
        
        // Category filter
        if (category && t.category !== category) return false;
        
        // Type filter
        if (type === 'global' && !t.is_global) return false;
        if (type === 'personal' && t.is_global) return false;
        
        return true;
    });
    
    // Sorting
    if (sortBy === 'usage') {
        filteredTemplates.sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
    } else if (sortBy === 'recent') {
        filteredTemplates.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    } else if (sortBy === 'alphabetical') {
        filteredTemplates.sort((a, b) => a.title.localeCompare(b.title));
    }
    
    renderTemplatesTable();
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

function updatePreview() {
    const content = document.getElementById('templateContent').value;
    const preview = document.getElementById('templatePreview');
    
    // Replace variables with example values
    let previewText = content
        .replace(/{buyer_name}/g, '[Buyer Name]')
        .replace(/{supplier_name}/g, '[Supplier Name]')
        .replace(/{company_name}/g, '[Company]')
        .replace(/{product_name}/g, '[Product]')
        .replace(/{inquiry_number}/g, 'INQ-001')
        .replace(/{quote_number}/g, 'QTE-001')
        .replace(/{order_number}/g, 'PO-001')
        .replace(/{amount}/g, 'UGX 100,000')
        .replace(/{date}/g, new Date().toLocaleDateString());
    
    preview.textContent = previewText || 'Preview will appear here...';
}

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

function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
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

function formatDate(dateString) {
    return moment(dateString).format('MMM D, YYYY');
}

function formatDateTime(dateString) {
    return moment(dateString).format('MMM D, YYYY h:mm A');
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function showSuccess(message) {
    document.getElementById('successMessage').textContent = message;
    document.getElementById('successModal').classList.add('show');
}

// ============================================
// MODAL FUNCTIONS
// ============================================
window.closeTemplateModal = () => document.getElementById('templateModal').classList.remove('show');
window.closeViewTemplateModal = () => document.getElementById('viewTemplateModal').classList.remove('show');
window.closeDeleteModal = () => document.getElementById('deleteModal').classList.remove('show');
window.closeBulkModal = () => document.getElementById('bulkModal').classList.remove('show');
window.closeImportModal = () => document.getElementById('importModal').classList.remove('show');
window.closeExportModal = () => document.getElementById('exportModal').classList.remove('show');
window.closeStatsModal = () => document.getElementById('statsModal').classList.remove('show');
window.closeSuccessModal = () => document.getElementById('successModal').classList.remove('show');

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Create button
    document.getElementById('createTemplateBtn')?.addEventListener('click', showCreateTemplateModal);
    
    // Refresh button
    document.getElementById('refreshBtn')?.addEventListener('click', loadTemplates);
    
    // Filters
    document.getElementById('searchTemplates')?.addEventListener('input', filterTemplates);
    document.getElementById('categoryFilter')?.addEventListener('change', filterTemplates);
    document.getElementById('typeFilter')?.addEventListener('change', filterTemplates);
    document.getElementById('sortBy')?.addEventListener('change', filterTemplates);
    
    // Form inputs
    document.getElementById('templateTitle')?.addEventListener('input', updateCharCounters);
    document.getElementById('templateContent')?.addEventListener('input', updateCharCounters);
    
    // Import
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
                closeViewTemplateModal();
                closeDeleteModal();
                closeBulkModal();
                closeImportModal();
                closeExportModal();
                closeStatsModal();
                closeSuccessModal();
            }
        });
    });
}

// Make functions globally available
window.showCreateTemplateModal = showCreateTemplateModal;
window.editTemplate = editTemplate;
window.viewTemplate = viewTemplate;
window.duplicateTemplate = duplicateTemplate;
window.deleteTemplate = deleteTemplate;
window.showBulkActions = showBulkActions;
window.bulkAction = bulkAction;
window.showImportModal = showImportModal;
window.showExportModal = showExportModal;
window.showStatsModal = showStatsModal;
window.duplicateCategory = duplicateCategory;
window.exportTemplates = exportTemplates;
window.insertVariable = insertVariable;
window.closeTemplateModal = closeTemplateModal;
window.closeViewTemplateModal = closeViewTemplateModal;
window.closeDeleteModal = closeDeleteModal;
window.closeBulkModal = closeBulkModal;
window.closeImportModal = closeImportModal;
window.closeExportModal = closeExportModal;
window.closeStatsModal = closeStatsModal;
window.closeSuccessModal = closeSuccessModal;