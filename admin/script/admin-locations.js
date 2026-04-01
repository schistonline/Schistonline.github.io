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
let currentLevel = 'regions';
let locations = [];
let regions = [];
let districts = [];
let counties = [];
let currentPage = 1;
let totalPages = 1;
let currentEditItem = null;

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await checkAdminStatus();
    await loadStats();
    await loadLocations();
    setupEventListeners();
});

// ============================================
// AUTHENTICATION
// ============================================
async function checkAuth() {
    try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) {
            window.location.href = 'login.html?redirect=admin-locations.html';
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
// LOAD STATS
// ============================================
async function loadStats() {
    try {
        const { count: regions } = await sb
            .from('regions')
            .select('*', { count: 'exact', head: true });
            
        const { count: districts } = await sb
            .from('districts')
            .select('*', { count: 'exact', head: true });
            
        const { count: counties } = await sb
            .from('counties')
            .select('*', { count: 'exact', head: true });
            
        const { count: subCounties } = await sb
            .from('sub_counties')
            .select('*', { count: 'exact', head: true });
            
        document.getElementById('totalRegions').textContent = regions || 0;
        document.getElementById('totalDistricts').textContent = districts || 0;
        document.getElementById('totalCounties').textContent = counties || 0;
        document.getElementById('totalSubCounties').textContent = subCounties || 0;
        
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// ============================================
// LOAD LOCATIONS
// ============================================
async function loadLocations() {
    showLoading(true);
    
    try {
        const searchTerm = document.getElementById('searchLocations').value;
        const statusFilter = document.getElementById('statusFilter').value;
        const regionFilter = document.getElementById('regionFilter')?.value;
        const districtFilter = document.getElementById('districtFilter')?.value;
        const countyFilter = document.getElementById('countyFilter')?.value;
        
        let query;
        let countQuery;
        
        switch(currentLevel) {
            case 'regions':
                query = sb.from('regions').select('*');
                countQuery = sb.from('regions').select('*', { count: 'exact', head: true });
                break;
                
            case 'districts':
                query = sb.from('districts').select(`
                    *,
                    region:regions(name)
                `);
                countQuery = sb.from('districts').select('*', { count: 'exact', head: true });
                
                if (regionFilter) {
                    query = query.eq('region_id', regionFilter);
                }
                break;
                
            case 'counties':
                query = sb.from('counties').select(`
                    *,
                    district:districts(name, region:regions(name))
                `);
                countQuery = sb.from('counties').select('*', { count: 'exact', head: true });
                
                if (districtFilter) {
                    query = query.eq('district_id', districtFilter);
                }
                break;
                
            case 'subcounties':
                query = sb.from('sub_counties').select(`
                    *,
                    county:counties(name, district:districts(name, region:regions(name)))
                `);
                countQuery = sb.from('sub_counties').select('*', { count: 'exact', head: true });
                
                if (countyFilter) {
                    query = query.eq('county_id', countyFilter);
                }
                break;
        }
        
        if (searchTerm) {
            query = query.ilike('name', `%${searchTerm}%`);
        }
        
        if (statusFilter !== 'all') {
            query = query.eq('is_active', statusFilter === 'active');
        }
        
        query = query.order('name');
        
        const from = (currentPage - 1) * 20;
        const to = from + 20 - 1;
        
        const { data, error } = await query.range(from, to);
        const { count } = await countQuery;
        
        if (error) throw error;
        
        locations = data || [];
        totalPages = Math.ceil((count || 0) / 20);
        
        renderTable();
        renderPagination();
        
    } catch (error) {
        console.error('Error loading locations:', error);
        showToast('Failed to load locations');
    } finally {
        showLoading(false);
    }
}

// ============================================
// RENDER TABLE
// ============================================
function renderTable() {
    const tableContainer = document.getElementById('tableContainer');
    const emptyState = document.getElementById('emptyState');
    const thead = document.getElementById('tableHeader');
    const tbody = document.getElementById('tableBody');
    
    if (locations.length === 0) {
        tableContainer.style.display = 'none';
        emptyState.style.display = 'block';
        document.getElementById('pagination').style.display = 'none';
        return;
    }
    
    tableContainer.style.display = 'block';
    emptyState.style.display = 'none';
    document.getElementById('pagination').style.display = 'flex';
    
    // Render header
    let headers = [];
    switch(currentLevel) {
        case 'regions':
            headers = ['Name', 'Code', 'Status', 'Created', 'Actions'];
            break;
        case 'districts':
            headers = ['Name', 'Code', 'Region', 'Capital', 'Status', 'Actions'];
            break;
        case 'counties':
            headers = ['Name', 'Type', 'District', 'Status', 'Actions'];
            break;
        case 'subcounties':
            headers = ['Name', 'Type', 'County', 'Postal Code', 'Status', 'Actions'];
            break;
    }
    
    thead.innerHTML = `
        <tr>
            ${headers.map(h => `<th>${h}</th>`).join('')}
        </tr>
    `;
    
    // Render body
    tbody.innerHTML = locations.map(item => {
        switch(currentLevel) {
            case 'regions':
                return `
                    <tr>
                        <td>
                            <div class="location-name">${escapeHtml(item.name)}</div>
                            ${item.country_code ? `<div class="location-code">${item.country_code}</div>` : ''}
                        </td>
                        <td><span class="location-code">${item.code || '-'}</span></td>
                        <td><span class="status-badge ${item.is_active ? 'active' : 'inactive'}">${item.is_active ? 'Active' : 'Inactive'}</span></td>
                        <td>${formatDate(item.created_at)}</td>
                        <td class="actions-cell">
                            <button class="action-btn" onclick="editLocation(${item.id})" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="action-btn delete" onclick="deleteLocation(${item.id}, '${escapeHtml(item.name)}')" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
                
            case 'districts':
                return `
                    <tr>
                        <td>
                            <div class="location-name">${escapeHtml(item.name)}</div>
                            ${item.code ? `<div class="location-code">${item.code}</div>` : ''}
                        </td>
                        <td><span class="location-code">${item.code || '-'}</span></td>
                        <td>
                            <div class="parent-info">
                                <i class="fas fa-globe-africa"></i>
                                ${item.region?.name || 'N/A'}
                            </div>
                        </td>
                        <td>${item.capital_city || '-'}</td>
                        <td><span class="status-badge ${item.is_active ? 'active' : 'inactive'}">${item.is_active ? 'Active' : 'Inactive'}</span></td>
                        <td class="actions-cell">
                            <button class="action-btn" onclick="editLocation(${item.id})" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="action-btn delete" onclick="deleteLocation(${item.id}, '${escapeHtml(item.name)}')" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
                
            case 'counties':
                return `
                    <tr>
                        <td>
                            <div class="location-name">${escapeHtml(item.name)}</div>
                        </td>
                        <td>${item.type || 'county'}</td>
                        <td>
                            <div class="parent-info">
                                <i class="fas fa-map-marker-alt"></i>
                                ${item.district?.name || 'N/A'}
                                ${item.district?.region ? `<span style="color: var(--gray-400)"> (${item.district.region.name})</span>` : ''}
                            </div>
                        </td>
                        <td><span class="status-badge ${item.is_active ? 'active' : 'inactive'}">${item.is_active ? 'Active' : 'Inactive'}</span></td>
                        <td class="actions-cell">
                            <button class="action-btn" onclick="editLocation(${item.id})" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="action-btn delete" onclick="deleteLocation(${item.id}, '${escapeHtml(item.name)}')" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
                
            case 'subcounties':
                return `
                    <tr>
                        <td>
                            <div class="location-name">${escapeHtml(item.name)}</div>
                        </td>
                        <td>${item.type || 'sub_county'}</td>
                        <td>
                            <div class="parent-info">
                                <i class="fas fa-city"></i>
                                ${item.county?.name || 'N/A'}
                            </div>
                        </td>
                        <td>${item.postal_code || '-'}</td>
                        <td><span class="status-badge ${item.is_active ? 'active' : 'inactive'}">${item.is_active ? 'Active' : 'Inactive'}</span></td>
                        <td class="actions-cell">
                            <button class="action-btn" onclick="editLocation(${item.id})" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="action-btn delete" onclick="deleteLocation(${item.id}, '${escapeHtml(item.name)}')" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
        }
    }).join('');
}

function renderPagination() {
    const container = document.getElementById('pagination');
    let html = '';
    
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            html += `<span class="page-dots">...</span>`;
        }
    }
    
    container.innerHTML = html;
}

// ============================================
// FILTERS
// ============================================
async function loadFilterOptions() {
    try {
        // Load regions for district filter
        const { data: regionsData } = await sb.from('regions').select('id, name').eq('is_active', true);
        regions = regionsData || [];
        
        const regionFilter = document.getElementById('regionFilter');
        if (regionFilter) {
            regionFilter.innerHTML = '<option value="">All Regions</option>' + 
                regions.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
        }
        
        // Load districts for county filter
        if (currentLevel === 'counties' || currentLevel === 'subcounties') {
            const { data: districtsData } = await sb.from('districts').select('id, name').eq('is_active', true);
            districts = districtsData || [];
            
            const districtFilter = document.getElementById('districtFilter');
            if (districtFilter) {
                districtFilter.innerHTML = '<option value="">All Districts</option>' + 
                    districts.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
                districtFilter.style.display = 'block';
            }
        } else {
            document.getElementById('districtFilter').style.display = 'none';
        }
        
        // Load counties for subcounty filter
        if (currentLevel === 'subcounties') {
            const { data: countiesData } = await sb.from('counties').select('id, name').eq('is_active', true);
            counties = countiesData || [];
            
            const countyFilter = document.getElementById('countyFilter');
            if (countyFilter) {
                countyFilter.innerHTML = '<option value="">All Counties</option>' + 
                    counties.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
                countyFilter.style.display = 'block';
            }
        } else {
            document.getElementById('countyFilter').style.display = 'none';
        }
        
    } catch (error) {
        console.error('Error loading filters:', error);
    }
}

// ============================================
// MODAL FUNCTIONS
// ============================================
window.showAddModal = function() {
    currentEditItem = null;
    document.getElementById('modalTitle').textContent = `Add ${currentLevel.slice(0, -1)}`;
    renderModalFields();
    document.getElementById('locationModal').classList.add('show');
};

window.editLocation = async function(id) {
    try {
        let data;
        switch(currentLevel) {
            case 'regions':
                data = await sb.from('regions').select('*').eq('id', id).single();
                break;
            case 'districts':
                data = await sb.from('districts').select('*').eq('id', id).single();
                break;
            case 'counties':
                data = await sb.from('counties').select('*').eq('id', id).single();
                break;
            case 'subcounties':
                data = await sb.from('sub_counties').select('*').eq('id', id).single();
                break;
        }
        
        currentEditItem = data.data;
        document.getElementById('modalTitle').textContent = `Edit ${currentLevel.slice(0, -1)}`;
        renderModalFields();
        document.getElementById('locationModal').classList.add('show');
        
    } catch (error) {
        console.error('Error loading location:', error);
        showToast('Failed to load location');
    }
};

function renderModalFields() {
    const container = document.getElementById('modalFields');
    let html = '';
    
    switch(currentLevel) {
        case 'regions':
            html = `
                <div class="form-group">
                    <label>Region Name <span class="required">*</span></label>
                    <input type="text" id="regionName" value="${currentEditItem?.name || ''}" required>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Code</label>
                        <input type="text" id="regionCode" value="${currentEditItem?.code || ''}" maxlength="3" placeholder="e.g., CEN">
                    </div>
                    <div class="form-group">
                        <label>Country Code</label>
                        <input type="text" id="countryCode" value="${currentEditItem?.country_code || 'UG'}" maxlength="2">
                    </div>
                </div>
                <div class="form-group">
                    <label>Display Order</label>
                    <input type="number" id="displayOrder" value="${currentEditItem?.display_order || 0}" min="0">
                </div>
                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="isActive" ${currentEditItem?.is_active !== false ? 'checked' : ''}>
                        <span>Active</span>
                    </label>
                </div>
            `;
            break;
            
        case 'districts':
            html = `
                <div class="form-group">
                    <label>District Name <span class="required">*</span></label>
                    <input type="text" id="districtName" value="${currentEditItem?.name || ''}" required>
                </div>
                <div class="form-group">
                    <label>Region <span class="required">*</span></label>
                    <select id="districtRegion" required>
                        <option value="">Select Region</option>
                        ${regions.map(r => `<option value="${r.id}" ${currentEditItem?.region_id === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Code</label>
                        <input type="text" id="districtCode" value="${currentEditItem?.code || ''}" maxlength="3" placeholder="e.g., KLA">
                    </div>
                    <div class="form-group">
                        <label>Capital City</label>
                        <input type="text" id="capitalCity" value="${currentEditItem?.capital_city || ''}">
                    </div>
                </div>
                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="isActive" ${currentEditItem?.is_active !== false ? 'checked' : ''}>
                        <span>Active</span>
                    </label>
                </div>
            `;
            break;
            
        case 'counties':
            html = `
                <div class="form-group">
                    <label>County Name <span class="required">*</span></label>
                    <input type="text" id="countyName" value="${currentEditItem?.name || ''}" required>
                </div>
                <div class="form-group">
                    <label>District <span class="required">*</span></label>
                    <select id="countyDistrict" required>
                        <option value="">Select District</option>
                        ${districts.map(d => `<option value="${d.id}" ${currentEditItem?.district_id === d.id ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Type</label>
                    <select id="countyType">
                        <option value="county" ${currentEditItem?.type === 'county' ? 'selected' : ''}>County</option>
                        <option value="municipality" ${currentEditItem?.type === 'municipality' ? 'selected' : ''}>Municipality</option>
                        <option value="city_division" ${currentEditItem?.type === 'city_division' ? 'selected' : ''}>City Division</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="isActive" ${currentEditItem?.is_active !== false ? 'checked' : ''}>
                        <span>Active</span>
                    </label>
                </div>
            `;
            break;
            
        case 'subcounties':
            html = `
                <div class="form-group">
                    <label>Sub-County Name <span class="required">*</span></label>
                    <input type="text" id="subCountyName" value="${currentEditItem?.name || ''}" required>
                </div>
                <div class="form-group">
                    <label>County <span class="required">*</span></label>
                    <select id="subCountyCounty" required>
                        <option value="">Select County</option>
                        ${counties.map(c => `<option value="${c.id}" ${currentEditItem?.county_id === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Type</label>
                        <select id="subCountyType">
                            <option value="sub_county" ${currentEditItem?.type === 'sub_county' ? 'selected' : ''}>Sub-County</option>
                            <option value="parish" ${currentEditItem?.type === 'parish' ? 'selected' : ''}>Parish</option>
                            <option value="ward" ${currentEditItem?.type === 'ward' ? 'selected' : ''}>Ward</option>
                            <option value="town_council" ${currentEditItem?.type === 'town_council' ? 'selected' : ''}>Town Council</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Postal Code</label>
                        <input type="text" id="postalCode" value="${currentEditItem?.postal_code || ''}">
                    </div>
                </div>
                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="isActive" ${currentEditItem?.is_active !== false ? 'checked' : ''}>
                        <span>Active</span>
                    </label>
                </div>
            `;
            break;
    }
    
    container.innerHTML = html;
}

// ============================================
// SAVE LOCATION
// ============================================
window.saveLocation = async function() {
    const saveBtn = document.getElementById('saveLocationBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    
    try {
        let data = {};
        let table;
        let error;
        
        switch(currentLevel) {
            case 'regions':
                data = {
                    name: document.getElementById('regionName').value,
                    code: document.getElementById('regionCode').value || null,
                    country_code: document.getElementById('countryCode').value || 'UG',
                    display_order: parseInt(document.getElementById('displayOrder').value) || 0,
                    is_active: document.getElementById('isActive').checked
                };
                
                if (!data.name) throw new Error('Region name is required');
                
                if (currentEditItem) {
                    ({ error } = await sb.from('regions').update(data).eq('id', currentEditItem.id));
                } else {
                    ({ error } = await sb.from('regions').insert(data));
                }
                break;
                
            case 'districts':
                data = {
                    name: document.getElementById('districtName').value,
                    region_id: parseInt(document.getElementById('districtRegion').value),
                    code: document.getElementById('districtCode').value || null,
                    capital_city: document.getElementById('capitalCity').value || null,
                    is_active: document.getElementById('isActive').checked
                };
                
                if (!data.name) throw new Error('District name is required');
                if (!data.region_id) throw new Error('Region is required');
                
                if (currentEditItem) {
                    ({ error } = await sb.from('districts').update(data).eq('id', currentEditItem.id));
                } else {
                    ({ error } = await sb.from('districts').insert(data));
                }
                break;
                
            case 'counties':
                data = {
                    name: document.getElementById('countyName').value,
                    district_id: parseInt(document.getElementById('countyDistrict').value),
                    type: document.getElementById('countyType').value,
                    is_active: document.getElementById('isActive').checked
                };
                
                if (!data.name) throw new Error('County name is required');
                if (!data.district_id) throw new Error('District is required');
                
                if (currentEditItem) {
                    ({ error } = await sb.from('counties').update(data).eq('id', currentEditItem.id));
                } else {
                    ({ error } = await sb.from('counties').insert(data));
                }
                break;
                
            case 'subcounties':
                data = {
                    name: document.getElementById('subCountyName').value,
                    county_id: parseInt(document.getElementById('subCountyCounty').value),
                    type: document.getElementById('subCountyType').value,
                    postal_code: document.getElementById('postalCode').value || null,
                    is_active: document.getElementById('isActive').checked
                };
                
                if (!data.name) throw new Error('Sub-county name is required');
                if (!data.county_id) throw new Error('County is required');
                
                if (currentEditItem) {
                    ({ error } = await sb.from('sub_counties').update(data).eq('id', currentEditItem.id));
                } else {
                    ({ error } = await sb.from('sub_counties').insert(data));
                }
                break;
        }
        
        if (error) throw error;
        
        showSuccess(`${currentLevel.slice(0, -1)} saved successfully`);
        closeLocationModal();
        await loadStats();
        await loadLocations();
        
    } catch (error) {
        console.error('Error saving location:', error);
        showToast(error.message || 'Failed to save location');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = 'Save';
    }
};

// ============================================
// DELETE LOCATION
// ============================================
window.deleteLocation = function(id, name) {
    document.getElementById('deleteItemName').textContent = name;
    document.getElementById('deleteModal').dataset.id = id;
    document.getElementById('deleteModal').classList.add('show');
};

document.getElementById('confirmDeleteBtn')?.addEventListener('click', async () => {
    const id = document.getElementById('deleteModal').dataset.id;
    
    try {
        let error;
        
        switch(currentLevel) {
            case 'regions':
                ({ error } = await sb.from('regions').delete().eq('id', id));
                break;
            case 'districts':
                ({ error } = await sb.from('districts').delete().eq('id', id));
                break;
            case 'counties':
                ({ error } = await sb.from('counties').delete().eq('id', id));
                break;
            case 'subcounties':
                ({ error } = await sb.from('sub_counties').delete().eq('id', id));
                break;
        }
        
        if (error) throw error;
        
        showSuccess('Location deleted successfully');
        closeDeleteModal();
        await loadStats();
        await loadLocations();
        
    } catch (error) {
        console.error('Error deleting location:', error);
        showToast('Failed to delete location');
    }
});

// ============================================
// IMPORT
// ============================================
document.getElementById('importBtn')?.addEventListener('click', () => {
    document.getElementById('importModal').classList.add('show');
});

document.getElementById('csvUploadArea')?.addEventListener('click', () => {
    document.getElementById('csvFile').click();
});

document.getElementById('csvFile')?.addEventListener('change', handleCSVUpload);

function handleCSVUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        document.getElementById('bulkData').value = event.target.result;
    };
    reader.readAsText(file);
}

window.processImport = async function() {
    const bulkData = document.getElementById('bulkData').value;
    const level = document.getElementById('bulkLevel').value;
    
    if (!bulkData) {
        showToast('Please enter data to import');
        return;
    }
    
    const lines = bulkData.split('\n').filter(line => line.trim());
    let success = 0;
    let errors = 0;
    
    showToast(`Processing ${lines.length} entries...`, 'info');
    
    for (const line of lines) {
        try {
            const parts = line.split(',').map(p => p.trim());
            
            switch(level) {
                case 'regions':
                    if (parts.length >= 2) {
                        await sb.from('regions').insert({
                            name: parts[0],
                            code: parts[1] || null,
                            country_code: parts[2] || 'UG'
                        });
                        success++;
                    }
                    break;
                    
                case 'districts':
                    if (parts.length >= 3) {
                        const region = await sb.from('regions').select('id').eq('name', parts[2]).single();
                        if (region.data) {
                            await sb.from('districts').insert({
                                name: parts[0],
                                code: parts[1] || null,
                                region_id: region.data.id
                            });
                            success++;
                        }
                    }
                    break;
            }
        } catch (error) {
            console.error('Import error:', error);
            errors++;
        }
    }
    
    showSuccess(`Imported ${success} entries, ${errors} errors`);
    closeImportModal();
    await loadStats();
    await loadLocations();
};

// ============================================
// UTILITY FUNCTIONS
// ============================================
function showLoading(show) {
    document.getElementById('loadingState').style.display = show ? 'flex' : 'none';
    document.getElementById('tableContainer').style.display = show ? 'none' : 'block';
}

function showSuccess(message) {
    document.getElementById('successMessage').textContent = message;
    document.getElementById('successModal').classList.add('show');
}

function showToast(message, type = 'error') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function formatDate(dateString) {
    return moment(dateString).format('MMM D, YYYY');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.goToPage = function(page) {
    currentPage = page;
    loadLocations();
};

// ============================================
// MODAL CLOSE FUNCTIONS
// ============================================
window.closeLocationModal = () => document.getElementById('locationModal').classList.remove('show');
window.closeImportModal = () => document.getElementById('importModal').classList.remove('show');
window.closeDeleteModal = () => document.getElementById('deleteModal').classList.remove('show');
window.closeSuccessModal = () => document.getElementById('successModal').classList.remove('show');

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
    // Hierarchy navigation
    document.querySelectorAll('.hierarchy-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            document.querySelectorAll('.hierarchy-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            currentLevel = btn.dataset.level;
            currentPage = 1;
            document.getElementById('modalTitle').textContent = `Add ${currentLevel.slice(0, -1)}`;
            
            await loadFilterOptions();
            await loadLocations();
        });
    });
    
    // Add location button
    document.getElementById('addLocationBtn')?.addEventListener('click', showAddModal);
    
    // Refresh button
    document.getElementById('refreshBtn')?.addEventListener('click', () => {
        loadStats();
        loadLocations();
    });
    
    // Filters
    document.getElementById('searchLocations')?.addEventListener('input', debounce(() => {
        currentPage = 1;
        loadLocations();
    }, 500));
    
    document.getElementById('statusFilter')?.addEventListener('change', () => {
        currentPage = 1;
        loadLocations();
    });
    
    document.getElementById('regionFilter')?.addEventListener('change', () => {
        currentPage = 1;
        loadLocations();
    });
    
    document.getElementById('districtFilter')?.addEventListener('change', () => {
        currentPage = 1;
        loadLocations();
    });
    
    document.getElementById('countyFilter')?.addEventListener('change', () => {
        currentPage = 1;
        loadLocations();
    });
    
    // Close modals on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeLocationModal();
                closeImportModal();
                closeDeleteModal();
                closeSuccessModal();
            }
        });
    });
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Make functions globally available
window.goToPage = goToPage;
window.showAddModal = showAddModal;
window.editLocation = editLocation;
window.deleteLocation = deleteLocation;
window.saveLocation = saveLocation;
window.processImport = processImport;
window.closeLocationModal = closeLocationModal;
window.closeImportModal = closeImportModal;
window.closeDeleteModal = closeDeleteModal;
window.closeSuccessModal = closeSuccessModal;