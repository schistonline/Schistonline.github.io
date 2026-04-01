// ============================================
// POULTRY LISTINGS PAGE - PRODUCTION VERSION
// ============================================

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
let currentUser = null;
let allBatches = [];
let filteredBatches = [];
let currentPage = 1;
let itemsPerPage = 12;
let totalCount = 0;
let viewMode = 'grid';
let activeFilters = {
    search: '',
    birdType: 'all',
    minAge: '',
    maxAge: '',
    minPrice: '',
    maxPrice: '',
    district: 'all',
    status: 'all',
    sortBy: 'newest'
};

// ============================================
// INITIALIZATION
//=============================================
document.addEventListener('DOMContentLoaded', async function() {
    showLoading();
    await checkAuth();
    await loadStats();
    await loadBatches();
    initAOS();
    setupEventListeners();
    hideLoading();
});

// ============================================
// AUTHENTICATION
// ============================================
async function checkAuth() {
    try {
        const { data: { session } } = await sb.auth.getSession();
        
        if (session) {
            currentUser = session.user;
            
            // Update UI for logged in user
            const loginBtn = document.getElementById('loginBtn');
            const registerBtn = document.getElementById('registerBtn');
            const profileDropdown = document.getElementById('profileDropdown');
            
            if (loginBtn) loginBtn.style.display = 'none';
            if (registerBtn) registerBtn.style.display = 'none';
            if (profileDropdown) profileDropdown.style.display = 'block';
            
            // Load user profile
            await loadUserProfile();
        }
    } catch (error) {
        console.error('Auth check error:', error);
    }
}

async function loadUserProfile() {
    try {
        const { data: profile } = await sb
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();
        
        if (profile) {
            const profileImg = document.querySelector('#profileDropdown .profile-image');
            if (profileImg) {
                if (profile.avatar_url) {
                    profileImg.src = profile.avatar_url;
                } else {
                    profileImg.src = `https://ui-avatars.com/api/?name=${profile.full_name || 'User'}&background=0B4F6C&color=fff&size=40`;
                }
            }
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

async function logout() {
    try {
        await sb.auth.signOut();
        window.location.reload();
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// ============================================
// LOAD STATISTICS
// ============================================
async function loadStats() {
    try {
        // Get total suppliers count
        const { count: suppliersCount } = await sb
            .from('poultry_suppliers')
            .select('*', { count: 'exact', head: true })
            .eq('verified', true);
        
        // Get total batches count
        const { count: batchesCount } = await sb
            .from('poultry_batches')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'available');
        
        // Get total birds available
        const { data: batches } = await sb
            .from('poultry_batches')
            .select('available_quantity')
            .eq('status', 'available');
        
        const totalBirds = batches?.reduce((sum, b) => sum + (b.available_quantity || 0), 0) || 0;
        
        // Get average price
        const { data: priceData } = await sb
            .from('poultry_batches')
            .select('price_per_bird')
            .eq('status', 'available');
        
        const avgPrice = priceData?.length 
            ? Math.round(priceData.reduce((sum, b) => sum + (b.price_per_bird || 0), 0) / priceData.length)
            : 0;
        
        // Update UI
        document.getElementById('totalSuppliers').textContent = suppliersCount || 0;
        document.getElementById('totalBatches').textContent = batchesCount || 0;
        document.getElementById('totalBirds').textContent = formatNumber(totalBirds);
        document.getElementById('avgPrice').textContent = formatNumber(avgPrice);
        
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// ============================================
// LOAD BATCHES
// ============================================
async function loadBatches(reset = true) {
    try {
        if (reset) {
            currentPage = 1;
        }
        
        let query = sb
            .from('poultry_batches')
            .select(`
                *,
                supplier:poultry_suppliers (
                    id,
                    company_name,
                    verified,
                    district
                )
            `, { count: 'exact' })
            .eq('status', 'available')
            .range((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage - 1);
        
        // Apply filters
        if (activeFilters.search) {
            query = query.or(`title.ilike.%${activeFilters.search}%,breed.ilike.%${activeFilters.search}%,supplier.company_name.ilike.%${activeFilters.search}%`);
        }
        
        if (activeFilters.birdType && activeFilters.birdType !== 'all') {
            if (activeFilters.birdType === 'Others') {
                query = query.not('bird_type', 'in', '("Broiler","Layer","Cobb 500","Sasso","Kienyeji")');
            } else {
                query = query.eq('bird_type', activeFilters.birdType);
            }
        }
        
        if (activeFilters.minAge) {
            query = query.gte('age_weeks', parseInt(activeFilters.minAge));
        }
        
        if (activeFilters.maxAge) {
            query = query.lte('age_weeks', parseInt(activeFilters.maxAge));
        }
        
        if (activeFilters.minPrice) {
            query = query.gte('price_per_bird', parseInt(activeFilters.minPrice));
        }
        
        if (activeFilters.maxPrice) {
            query = query.lte('price_per_bird', parseInt(activeFilters.maxPrice));
        }
        
        if (activeFilters.district && activeFilters.district !== 'all') {
            query = query.eq('supplier.district', activeFilters.district);
        }
        
        // Apply sorting
        switch (activeFilters.sortBy) {
            case 'price_low':
                query = query.order('price_per_bird', { ascending: true });
                break;
            case 'price_high':
                query = query.order('price_per_bird', { ascending: false });
                break;
            case 'age_young':
                query = query.order('age_weeks', { ascending: true });
                break;
            case 'age_old':
                query = query.order('age_weeks', { ascending: false });
                break;
            case 'available':
                query = query.order('available_quantity', { ascending: false });
                break;
            default: // newest
                query = query.order('created_at', { ascending: false });
        }
        
        const { data, error, count } = await query;
        
        if (error) throw error;
        
        if (reset) {
            allBatches = data || [];
        } else {
            allBatches = [...allBatches, ...(data || [])];
        }
        
        totalCount = count || 0;
        
        displayBatches();
        updateResultsSummary();
        
        // Show/hide load more button
        const loadMoreBtn = document.getElementById('loadMoreBtn');
        if (loadMoreBtn) {
            loadMoreBtn.style.display = allBatches.length < totalCount ? 'inline-flex' : 'none';
        }
        
    } catch (error) {
        console.error('Error loading batches:', error);
        showToast('Failed to load batches', 'error');
    }
}

function displayBatches() {
    const grid = document.getElementById('batchesGrid');
    const noResults = document.getElementById('noResults');
    
    if (!grid) return;
    
    if (allBatches.length === 0) {
        grid.style.display = 'none';
        if (noResults) noResults.style.display = 'block';
        return;
    }
    
    grid.style.display = 'grid';
    if (noResults) noResults.style.display = 'none';
    
    grid.innerHTML = allBatches.map(batch => createBatchCard(batch)).join('');
}

function createBatchCard(batch) {
    const imageUrl = batch.images?.[0] || 'https://placehold.co/400/0B4F6C/white?text=Poultry';
    const supplierInitial = batch.supplier?.company_name?.charAt(0) || 'S';
    
    return `
        <a href="poultry-listing.html?id=${batch.id}" class="batch-card" data-aos="fade-up">
            <div class="batch-image">
                <img src="${imageUrl}" alt="${batch.title || 'Poultry batch'}" loading="lazy">
                <span class="batch-status ${batch.status}">${formatStatus(batch.status)}</span>
            </div>
            <div class="batch-content">
                <div class="batch-supplier">
                    <div class="supplier-avatar">${supplierInitial}</div>
                    <span class="supplier-name">${batch.supplier?.company_name || 'Unknown'}</span>
                    ${batch.supplier?.verified ? '<i class="fas fa-check-circle verified-badge"></i>' : ''}
                </div>
                <h3 class="batch-title">${batch.title || `${batch.bird_type || 'Poultry'} Batch`}</h3>
                <div class="batch-details">
                    <span class="batch-detail"><i class="fas fa-clock"></i> ${batch.age_weeks || '?'} weeks</span>
                    <span class="batch-detail"><i class="fas fa-weight-hanging"></i> ${batch.avg_weight_kg || '?'} kg</span>
                    <span class="batch-detail"><i class="fas fa-map-marker-alt"></i> ${batch.supplier?.district || 'Kampala'}</span>
                </div>
                <div class="batch-stats">
                    <div class="batch-price">
                        UGX ${formatNumber(batch.price_per_bird)} <small>@</small>
                    </div>
                    <div class="batch-available">
                        <i class="fas fa-check-circle"></i> ${batch.available_quantity || 0} left
                    </div>
                </div>
            </div>
        </a>
    `;
}

function updateResultsSummary() {
    const showingEl = document.getElementById('showingCount');
    const totalEl = document.getElementById('totalCount');
    
    if (showingEl) showingEl.textContent = allBatches.length;
    if (totalEl) totalEl.textContent = totalCount;
}

// ============================================
// LOAD MORE BATCHES
// ============================================
async function loadMoreBatches() {
    currentPage++;
    await loadBatches(false);
}

// ============================================
// FILTER FUNCTIONS
// ============================================
function applyFilters() {
    // Collect filter values
    activeFilters = {
        search: document.getElementById('searchInput')?.value || '',
        birdType: document.getElementById('birdTypeFilter')?.value || 'all',
        minAge: document.getElementById('minAge')?.value || '',
        maxAge: document.getElementById('maxAge')?.value || '',
        minPrice: document.getElementById('minPrice')?.value || '',
        maxPrice: document.getElementById('maxPrice')?.value || '',
        district: document.getElementById('districtFilter')?.value || 'all',
        status: document.getElementById('statusFilter')?.value || 'all',
        sortBy: document.getElementById('sortBy')?.value || 'newest'
    };
    
    // Update active filters display
    updateActiveFiltersDisplay();
    
    // Reload batches
    loadBatches(true);
}

function updateActiveFiltersDisplay() {
    const container = document.getElementById('activeFilters');
    if (!container) return;
    
    const filters = [];
    
    if (activeFilters.search) filters.push(`Search: "${activeFilters.search}"`);
    if (activeFilters.birdType !== 'all') filters.push(`Type: ${activeFilters.birdType}`);
    if (activeFilters.minAge || activeFilters.maxAge) {
        filters.push(`Age: ${activeFilters.minAge || '0'}-${activeFilters.maxAge || 'any'} weeks`);
    }
    if (activeFilters.minPrice || activeFilters.maxPrice) {
        filters.push(`Price: UGX ${activeFilters.minPrice || '0'}-${activeFilters.maxPrice || 'any'}`);
    }
    if (activeFilters.district !== 'all') filters.push(`District: ${activeFilters.district}`);
    
    if (filters.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = filters.map(filter => `
        <span class="active-filter-tag">
            ${filter}
            <i class="fas fa-times" onclick="removeFilter('${filter}')"></i>
        </span>
    `).join('');
}

function removeFilter(filterText) {
    // This is a simplified version - you might want to implement specific filter removal
    clearFilters();
}

function clearFilters() {
    // Reset all filter inputs
    document.getElementById('searchInput').value = '';
    document.getElementById('birdTypeFilter').value = 'all';
    document.getElementById('minAge').value = '';
    document.getElementById('maxAge').value = '';
    document.getElementById('minPrice').value = '';
    document.getElementById('maxPrice').value = '';
    document.getElementById('districtFilter').value = 'all';
    document.getElementById('statusFilter').value = 'all';
    document.getElementById('sortBy').value = 'newest';
    
    // Reset active filters
    activeFilters = {
        search: '',
        birdType: 'all',
        minAge: '',
        maxAge: '',
        minPrice: '',
        maxPrice: '',
        district: 'all',
        status: 'all',
        sortBy: 'newest'
    };
    
    document.getElementById('activeFilters').innerHTML = '';
    
    // Reload batches
    loadBatches(true);
}

// ============================================
// VIEW MODE
// ============================================
function setViewMode(mode) {
    viewMode = mode;
    const grid = document.getElementById('batchesGrid');
    
    // Update button states
    document.querySelectorAll('.view-option').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.closest('.view-option').classList.add('active');
    
    // Update grid class
    if (grid) {
        if (mode === 'list') {
            grid.classList.add('list-view');
        } else {
            grid.classList.remove('list-view');
        }
    }
}

// ============================================
// SEARCH OVERLAY
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) {
        searchBtn.addEventListener('click', function() {
            document.getElementById('searchOverlay').classList.add('show');
        });
    }
});

function closeSearch() {
    document.getElementById('searchOverlay').classList.remove('show');
}

// ============================================
// MOBILE MENU
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', function() {
            document.getElementById('navMenu').classList.toggle('show');
        });
    }
    
    // Close mobile menu when clicking outside
    document.addEventListener('click', function(event) {
        const navMenu = document.getElementById('navMenu');
        const mobileBtn = document.getElementById('mobileMenuBtn');
        
        if (!navMenu || !mobileBtn) return;
        
        if (!navMenu.contains(event.target) && !mobileBtn.contains(event.target)) {
            navMenu.classList.remove('show');
        }
    });
});

// ============================================
// PROFILE DROPDOWN
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    const profileDropdown = document.getElementById('profileDropdown');
    if (profileDropdown) {
        profileDropdown.addEventListener('click', function(e) {
            e.stopPropagation();
            document.getElementById('dropdownMenu').classList.toggle('show');
        });
    }
    
    document.addEventListener('click', function() {
        document.getElementById('dropdownMenu')?.classList.remove('show');
    });
});

// ============================================
// GLOBAL SEARCH
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    const globalSearch = document.getElementById('globalSearch');
    if (globalSearch) {
        globalSearch.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const query = this.value.trim();
                if (query) {
                    document.getElementById('searchInput').value = query;
                    applyFilters();
                    closeSearch();
                }
            }
        });
    }
});

// ============================================
// FILTER EVENT LISTENERS
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    // Add change event listeners to all filters
    const filterInputs = [
        'searchInput', 'birdTypeFilter', 'minAge', 'maxAge',
        'minPrice', 'maxPrice', 'districtFilter', 'statusFilter', 'sortBy'
    ];
    
    filterInputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', debounce(applyFilters, 500));
            element.addEventListener('change', applyFilters);
        }
    });
});

// ============================================
// ANIMATION INITIALIZATION
// ============================================
function initAOS() {
    if (typeof AOS !== 'undefined') {
        AOS.init({
            duration: 600,
            once: true,
            offset: 50,
            disable: window.innerWidth < 768
        });
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function formatNumber(num) {
    if (!num && num !== 0) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatStatus(status) {
    if (!status) return 'Available';
    return status.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function showLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.add('show');
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.remove('show');
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

function setupEventListeners() {
    // Refresh on orientation change
    window.addEventListener('orientationchange', function() {
        setTimeout(() => {
            // Refresh any layout-dependent elements
        }, 200);
    });
}