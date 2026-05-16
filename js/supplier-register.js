// ============================================
// SUPPLIER REGISTRATION - BUY UGANDA
// Mobile Responsive Version
// ============================================

console.log('🚀 Supplier Registration loading...');

// Supabase Configuration
const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
let currentStep = 1;
let currentUser = null;
let currentProfile = null;
let map = null;
let marker = null;
let districts = [];
let selectedLat = null;
let selectedLng = null;

// Uganda districts list (fallback if database doesn't have districts)
const ugandaDistricts = [
    'Kampala', 'Wakiso', 'Mukono', 'Jinja', 'Mbarara', 'Gulu', 'Lira',
    'Masaka', 'Mbale', 'Arua', 'Fort Portal', 'Kabale', 'Bushenyi',
    'Tororo', 'Entebbe', 'Kasese', 'Soroti', 'Moroto', 'Kitgum', 'Nebbi',
    'Apac', 'Adjumani', 'Bugiri', 'Busia', 'Iganga', 'Kalungu',
    'Kamuli', 'Kapchorwa', 'Katakwi', 'Kayunga', 'Kibaale', 'Kiboga',
    'Kisoro', 'Kotido', 'Kumi', 'Kyenjojo', 'Luwero', 'Masindi',
    'Mayuge', 'Mityana', 'Mpigi', 'Mubende', 'Nakapiripirit', 'Nakasongola',
    'Pader', 'Rakai', 'Rukungiri', 'Sembabule', 'Sironko', 'Yumbe'
];

// ============================================
// AUTH CHECK - GET USER AND PROFILE
// ============================================
async function checkAuth() {
    try {
        showLoading(true, 'Checking authentication...');
        
        const { data: { user }, error } = await sb.auth.getUser();
        
        if (error) throw error;
        
        if (!user) {
            showToast('Please login to register as a supplier', 'error');
            setTimeout(() => {
                window.location.href = 'login.html?redirect=supplier-register.html';
            }, 2000);
            return false;
        }
        
        currentUser = user;
        console.log('✅ User authenticated:', user.email);
        
        // Get profile (should exist due to database trigger)
        const { data: profile, error: profileError } = await sb
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
        
        if (profileError) {
            console.error('Profile not found:', profileError);
            showToast('Please complete your profile first', 'error');
            setTimeout(() => {
                window.location.href = 'profile.html';
            }, 2000);
            return false;
        }
        
        currentProfile = profile;
        console.log('✅ Profile found:', profile.full_name || profile.email);
        
        // Check if already a supplier
        const { data: existingSupplier, error: supplierError } = await sb
            .from('suppliers')
            .select('id, verification_status')
            .eq('profile_id', user.id)
            .maybeSingle();
        
        if (existingSupplier) {
            showToast('You are already registered as a supplier', 'success');
            setTimeout(() => {
                window.location.href = 'supplier-dashboard.html';
            }, 1500);
            return false;
        }
        
        // Pre-fill business name from profile if available
        const businessNameInput = document.getElementById('businessName');
        if (businessNameInput && currentProfile.business_name) {
            businessNameInput.value = currentProfile.business_name;
        } else if (businessNameInput && currentProfile.full_name) {
            businessNameInput.value = currentProfile.full_name;
        }
        
        showLoading(false);
        return true;
        
    } catch (error) {
        console.error('Auth check error:', error);
        showLoading(false);
        showToast('Authentication error. Please login again.', 'error');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2000);
        return false;
    }
}

// ============================================
// LOAD DISTRICTS
// ============================================
async function loadDistricts() {
    try {
        const { data, error } = await sb
            .from('districts')
            .select('id, name')
            .eq('is_active', true)
            .order('name', { ascending: true });
            
        if (error || !data || data.length === 0) {
            districts = [...ugandaDistricts].sort();
        } else {
            districts = data.map(d => d.name).sort();
        }
        
        populateDistrictDropdown();
        
    } catch (error) {
        console.error('Error loading districts:', error);
        districts = [...ugandaDistricts].sort();
        populateDistrictDropdown();
    }
}

function populateDistrictDropdown() {
    const select = document.getElementById('district');
    if (!select) return;
    
    select.innerHTML = '<option value="">Select district</option>' +
        districts.map(d => `<option value="${d}">${d}</option>`).join('');
}

// ============================================
// MAP INITIALIZATION (Optional - won't break if map not loaded)
// ============================================
function initMap() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;
    
    try {
        map = L.map('map').setView([0.3136, 32.5811], 12);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
        
        map.on('click', function(e) {
            placeMarker(e.latlng.lat, e.latlng.lng);
        });
        
        console.log('✅ Map initialized');
    } catch (error) {
        console.warn('Map initialization failed (non-critical):', error);
    }
}

function placeMarker(lat, lng) {
    if (!map) return;
    
    if (marker) {
        map.removeLayer(marker);
    }
    
    marker = L.marker([lat, lng], { draggable: true }).addTo(map);
    
    marker.on('dragend', function(e) {
        const position = e.target.getLatLng();
        selectedLat = position.lat;
        selectedLng = position.lng;
    });
    
    selectedLat = lat;
    selectedLng = lng;
}

// ============================================
// LOCATION SEARCH (Optional)
// ============================================
function initLocationSearch() {
    const searchBtn = document.getElementById('searchLocationBtn');
    const searchInput = document.getElementById('locationSearch');
    
    if (!searchBtn || !searchInput) return;
    
    searchBtn.addEventListener('click', async function() {
        const query = searchInput.value.trim();
        if (!query || query.length < 3) {
            showToast('Please enter at least 3 characters to search', 'warning');
            return;
        }
        
        showLoading(true, 'Searching location...');
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}, Uganda&limit=1`,
                { signal: controller.signal }
            );
            
            clearTimeout(timeoutId);
            
            if (!response.ok) throw new Error('Network error');
            
            const data = await response.json();
            
            if (data && data.length > 0) {
                const location = data[0];
                const lat = parseFloat(location.lat);
                const lng = parseFloat(location.lon);
                
                if (map) {
                    map.setView([lat, lng], 15);
                    placeMarker(lat, lng);
                }
                
                const addressInput = document.getElementById('detailedAddress');
                if (addressInput && location.display_name) {
                    addressInput.value = location.display_name;
                }
                
                showToast('Location found!', 'success');
            } else {
                showToast('Location not found', 'warning');
            }
        } catch (error) {
            console.warn('Geocoding error:', error);
            showToast('Search failed - please enter address manually', 'warning');
        } finally {
            showLoading(false);
        }
    });
}

// ============================================
// PHONE VALIDATION
// ============================================
function isValidPhone(phone) {
    if (!phone) return false;
    return /^[0-9]{7,12}$/.test(phone.replace(/\D/g, ''));
}

function formatPhoneNumber(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length > 0) {
        input.value = value;
    }
}

// Update all phone prefixes when country code changes
function updatePhonePrefixes() {
    const countryCodeSelect = document.getElementById('countryCode');
    if (!countryCodeSelect) return;
    
    countryCodeSelect.addEventListener('change', function() {
        const code = this.value;
        const prefixes = document.querySelectorAll('.phone-prefix');
        prefixes.forEach(prefix => {
            prefix.textContent = code;
        });
    });
}

// ============================================
// STEP NAVIGATION
// ============================================
function goToStep(step) {
    // Update step display
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    const stepEl = document.getElementById(`step${step}`);
    if (stepEl) stepEl.classList.add('active');
    
    // Update progress steps
    document.querySelectorAll('.progress-step').forEach((s, i) => {
        const stepNum = i + 1;
        s.classList.remove('active', 'completed');
        
        if (stepNum < step) {
            s.classList.add('completed');
        } else if (stepNum === step) {
            s.classList.add('active');
        }
    });
    
    // Update step badge
    const stepBadge = document.getElementById('stepBadge');
    if (stepBadge) {
        stepBadge.textContent = `Step ${step} of 2`;
    }
    
    currentStep = step;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================
// VALIDATE STEP 1
// ============================================
async function validateStep1() {
    // Clear previous errors
    document.querySelectorAll('.error-message').forEach(e => e.classList.remove('show'));
    document.querySelectorAll('.form-input, input, select').forEach(e => e.classList.remove('error'));
    
    let isValid = true;
    
    // Get values
    const businessName = document.getElementById('businessName')?.value.trim() || '';
    const phone = document.getElementById('phone')?.value.trim() || '';
    const altPhone = document.getElementById('altPhone')?.value.trim() || '';
    const whatsapp = document.getElementById('whatsappNumber')?.value.trim() || '';
    const businessType = document.getElementById('businessType')?.value || '';
    const terms = document.getElementById('acceptTerms')?.checked || false;
    
    // Validate business name
    if (!businessName) {
        showFieldError('businessName', 'Business name is required');
        isValid = false;
    }
    
    // Validate phone
    if (!phone) {
        showFieldError('phone', 'Phone number is required');
        isValid = false;
    } else if (!isValidPhone(phone)) {
        showFieldError('phone', 'Enter a valid phone number (7-12 digits)');
        isValid = false;
    }
    
    // Validate alt phone if provided
    if (altPhone && !isValidPhone(altPhone)) {
        showFieldError('altPhone', 'Enter a valid phone number');
        isValid = false;
    }
    
    // Validate WhatsApp
    if (!whatsapp) {
        showFieldError('whatsappNumber', 'WhatsApp number is required');
        isValid = false;
    } else if (!isValidPhone(whatsapp)) {
        showFieldError('whatsappNumber', 'Enter a valid WhatsApp number (7-12 digits)');
        isValid = false;
    }
    
    // Validate business type
    if (!businessType) {
        showFieldError('businessType', 'Select your business type');
        isValid = false;
    }
    
    // Validate year established if provided
    const yearEst = document.getElementById('yearEstablished')?.value;
    if (yearEst) {
        const year = parseInt(yearEst);
        const currentYear = new Date().getFullYear();
        if (year < 1900 || year > currentYear) {
            showFieldError('yearEstablished', `Year must be between 1900 and ${currentYear}`);
            isValid = false;
        }
    }
    
    // Validate terms
    if (!terms) {
        showToast('Please accept the terms and conditions', 'error');
        isValid = false;
    }
    
    if (isValid) {
        // Save business info to session storage
        const businessInfo = {
            businessName,
            countryCode: document.getElementById('countryCode')?.value || '+256',
            phone,
            altPhone: altPhone || null,
            whatsapp,
            whatsappDepartment: document.getElementById('whatsappDepartment')?.value || 'sales',
            businessType,
            yearEstablished: yearEst || null,
            businessReg: document.getElementById('businessReg')?.value.trim() || null,
            tinNumber: document.getElementById('tinNumber')?.value.trim() || null
        };
        
        sessionStorage.setItem('supplierBusinessInfo', JSON.stringify(businessInfo));
        goToStep(2);
        showToast('Business information saved!', 'success');
    }
}

function showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    
    field.classList.add('error');
    
    let errorEl = document.getElementById(fieldId + 'Error');
    if (!errorEl) {
        errorEl = document.createElement('div');
        errorEl.className = 'error-message';
        errorEl.id = fieldId + 'Error';
        field.parentNode.appendChild(errorEl);
    }
    
    errorEl.textContent = message;
    errorEl.classList.add('show');
}

// ============================================
// SUBMIT SUPPLIER REGISTRATION
// ============================================
async function submitVerification() {
    // Validate Step 2 fields
    const detailedAddress = document.getElementById('detailedAddress')?.value.trim() || '';
    const city = document.getElementById('city')?.value.trim() || '';
    const district = document.getElementById('district')?.value || '';
    const contactPerson = document.getElementById('contactPerson')?.value.trim() || '';
    const verificationPhone = document.getElementById('verificationPhone')?.value.trim() || '';
    const verifyLocation = document.getElementById('verifyLocation')?.checked || false;
    
    if (!detailedAddress) {
        showToast('Please enter your business address', 'error');
        document.getElementById('detailedAddress')?.focus();
        return;
    }
    
    if (!city) {
        showToast('Please enter city/town', 'error');
        document.getElementById('city')?.focus();
        return;
    }
    
    if (!district) {
        showToast('Please select district', 'error');
        document.getElementById('district')?.focus();
        return;
    }
    
    if (!contactPerson) {
        showToast('Please enter contact person name', 'error');
        document.getElementById('contactPerson')?.focus();
        return;
    }
    
    if (!verificationPhone) {
        showToast('Please enter verification phone number', 'error');
        document.getElementById('verificationPhone')?.focus();
        return;
    }
    
    if (!isValidPhone(verificationPhone)) {
        showToast('Please enter a valid verification phone number', 'error');
        return;
    }
    
    if (!verifyLocation) {
        showToast('Please confirm your location information', 'error');
        return;
    }
    
    showLoading(true, 'Submitting your application...');
    
    try {
        // Get business info from session storage
        const businessInfo = JSON.parse(sessionStorage.getItem('supplierBusinessInfo'));
        
        if (!businessInfo) {
            throw new Error('Business information not found. Please restart registration.');
        }
        
        // Format full phone numbers
        const fullPhone = businessInfo.countryCode + businessInfo.phone;
        const fullAltPhone = businessInfo.altPhone ? businessInfo.countryCode + businessInfo.altPhone : null;
        const fullVerificationPhone = businessInfo.countryCode + verificationPhone;
        const fullWhatsapp = businessInfo.countryCode + businessInfo.whatsapp;
        
        // Update profile with business info
        const { error: profileError } = await sb
            .from('profiles')
            .update({
                business_name: businessInfo.businessName,
                business_type: businessInfo.businessType,
                phone: fullPhone,
                country_code: businessInfo.countryCode,
                location: detailedAddress,
                district: district,
                is_supplier: true,
                onboarding_step: 'verification_pending',
                updated_at: new Date().toISOString()
            })
            .eq('id', currentUser.id);
            
        if (profileError) throw profileError;

        // Create supplier record
        const { data: supplier, error: supplierError } = await sb
            .from('suppliers')
            .insert({
                profile_id: currentUser.id,
                business_name: businessInfo.businessName,
                business_registration: businessInfo.businessReg,
                tax_id: businessInfo.tinNumber,
                business_type: businessInfo.businessType,
                year_established: businessInfo.yearEstablished ? parseInt(businessInfo.yearEstablished) : null,
                business_phone: fullPhone,
                business_email: currentUser.email,
                country_code: businessInfo.countryCode,
                warehouse_location: detailedAddress,
                warehouse_district: district,
                warehouse_lat: selectedLat || null,
                warehouse_lng: selectedLng || null,
                verification_status: 'pending',
                contact_person: contactPerson,
                verification_phone: fullVerificationPhone,
                business_hours: {
                    weekdays: document.getElementById('weekdayHours')?.value || 'Not specified',
                    weekends: document.getElementById('weekendHours')?.value || 'Not specified'
                },
                preferred_call_time: document.getElementById('callTime')?.value || 'morning',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (supplierError) throw supplierError;

        // Insert WhatsApp number
        const { error: whatsappError } = await sb
            .from('supplier_whatsapp')
            .insert({
                supplier_id: supplier.id,
                whatsapp_number: fullWhatsapp,
                label: 'Primary',
                is_primary: true,
                is_active: true,
                display_name: businessInfo.businessName,
                department: businessInfo.whatsappDepartment || 'sales',
                auto_reply_enabled: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

        if (whatsappError) {
            console.error('Error saving WhatsApp number:', whatsappError);
            // Don't throw - this is non-critical
        }

        // Update WhatsApp preview in success modal
        const previewEl = document.getElementById('previewWhatsapp');
        if (previewEl) {
            previewEl.textContent = fullWhatsapp;
        }
        
        // Clear session storage
        sessionStorage.removeItem('supplierBusinessInfo');
        
        showLoading(false);
        
        // Show success modal
        const successModal = document.getElementById('successModal');
        if (successModal) successModal.classList.add('show');
        
    } catch (error) {
        console.error('Error submitting supplier application:', error);
        showLoading(false);
        showToast(error.message || 'Error submitting application. Please try again.', 'error');
    }
}

// ============================================
// UTILITIES
// ============================================
function showLoading(show, message = 'Processing...') {
    const overlay = document.getElementById('loadingOverlay');
    const messageEl = document.getElementById('loadingMessage');
    
    if (!overlay || !messageEl) return;
    
    if (show) {
        messageEl.textContent = message;
        overlay.classList.add('show');
    } else {
        overlay.classList.remove('show');
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

function setupEventListeners() {
    // Step navigation buttons
    const nextBtn = document.getElementById('nextToStep2');
    const backBtn = document.getElementById('backToStep1');
    const submitBtn = document.getElementById('submitVerification');
    
    if (nextBtn) nextBtn.addEventListener('click', validateStep1);
    if (backBtn) backBtn.addEventListener('click', () => goToStep(1));
    if (submitBtn) submitBtn.addEventListener('click', submitVerification);
    
    // Phone number formatting
    const phoneInputs = ['phone', 'altPhone', 'verificationPhone', 'whatsappNumber'];
    phoneInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', function() {
                formatPhoneNumber(this);
            });
        }
    });
    
    // Show WhatsApp department field when number is entered
    const whatsappInput = document.getElementById('whatsappNumber');
    if (whatsappInput) {
        whatsappInput.addEventListener('input', function() {
            const deptGroup = document.getElementById('whatsappDepartmentGroup');
            if (deptGroup) {
                deptGroup.style.display = this.value.length > 0 ? 'block' : 'none';
            }
        });
    }
    
    // Phone prefix updates
    updatePhonePrefixes();
}

// Modal close function
window.closeSuccessModal = function() {
    const modal = document.getElementById('successModal');
    if (modal) modal.classList.remove('show');
    window.location.href = 'supplier-dashboard.html';
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    const isAuthenticated = await checkAuth();
    if (!isAuthenticated) return;
    
    // Load districts
    await loadDistricts();
    
    // Setup event listeners
    setupEventListeners();
    
    // Initialize map (optional - won't break if fails)
    setTimeout(() => {
        if (document.getElementById('map')) {
            initMap();
            initLocationSearch();
        }
    }, 500);
});
