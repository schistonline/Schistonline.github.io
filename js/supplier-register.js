// ============================================
// SOURCEX SUPPLIER REGISTRATION
// ============================================

const SUPABASE_URL = 'https://uufhvmmgwzkxvvdbqemz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1Zmh2bW1nd3preHZ2ZGJxZW16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDIzNTYsImV4cCI6MjA4NTg3ODM1Nn0.WABHx4ilFRkhPHP-y4ZC4E8Kb7PRqY-cyxI8cVS8Tyc';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// STATE MANAGEMENT
// ============================================
let currentStep = 1;
let currentUser = null;
let map = null;
let marker = null;
let districts = [];
let selectedLat = null;
let selectedLng = null;

// Uganda districts list (hardcoded fallback)
const ugandaDistricts = [
    'Kampala', 'Wakiso', 'Mukono', 'Jinja', 'Mbarara', 'Gulu', 'Lira',
    'Masaka', 'Mbale', 'Arua', 'Fort Portal', 'Kabale', 'Bushenyi',
    'Tororo', 'Entebbe', 'Kasese', 'Soroti', 'Moroto', 'Kitgum', 'Nebbi',
    'Apac', 'Adjumani', 'Bugiri', 'Busia', 'Iganga', 'Kalungu',
    'Kamuli', 'Kapchorwa', 'Katakwi', 'Kayunga', 'Kibaale', 'Kiboga',
    'Kisoro', 'Kotido', 'Kumi', 'Kyenjojo', 'Luwero', 'Masindi',
    'Mayuge', 'Mityana', 'Mpigi', 'Mubende', 'Nakapiripirit', 'Nakasongola',
    'Pader', 'Rakai', 'Rukungiri', 'Sembabule', 'Sironko', 'Soroti',
    'Wakiso', 'Yumbe'
];

// ============================================
// WHATSAPP FUNCTIONS
// ============================================
function isValidWhatsApp(phone) {
    if (!phone) return false;
    // Allow 7-12 digits (local number without country code)
    return /^[0-9]{7,12}$/.test(phone.replace(/\D/g, ''));
}

function formatWhatsAppNumber(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length > 0) {
        input.value = value;
    }
}

// Generate WhatsApp deep link
function generateWhatsAppLink(whatsappNumber, businessName) {
    const cleanNumber = whatsappNumber.replace(/\D/g, '');
    const message = encodeURIComponent(`Hello ${businessName}, I'm interested in your products.`);
    return `https://wa.me/${cleanNumber}?text=${message}`;
}

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    await loadDistricts();
    initMap();
    setupEventListeners();
    initLocationSearch();
    updatePhonePrefixes();
    
    // Show WhatsApp department field when number is entered
    const whatsappInput = document.getElementById('whatsappNumber');
    if (whatsappInput) {
        whatsappInput.addEventListener('input', function() {
            const deptGroup = document.getElementById('whatsappDepartmentGroup');
            if (deptGroup) {
                if (this.value.length > 0) {
                    deptGroup.style.display = 'block';
                } else {
                    deptGroup.style.display = 'none';
                }
            }
        });
    }
});

// Update phone prefixes when country code changes
function updatePhonePrefixes() {
    const countryCodeSelect = document.getElementById('countryCode');
    if (!countryCodeSelect) return;
    
    countryCodeSelect.addEventListener('change', function() {
        const code = this.value;
        document.getElementById('phonePrefix').textContent = code;
        document.getElementById('altPhonePrefix').textContent = code;
        document.getElementById('verificationPhonePrefix').textContent = code;
        document.getElementById('whatsappPrefix').textContent = code;
    });
}

// ============================================
// CHECK AUTH
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
            return;
        }
        
        currentUser = user;
        
        // Check if already a supplier
        const { data: existingSupplier, error: supplierError } = await sb
            .from('suppliers')
            .select('id, verification_status')
            .eq('profile_id', user.id)
            .maybeSingle();
        
        if (supplierError) throw supplierError;
        
        if (existingSupplier) {
            showToast('You are already registered as a supplier', 'success');
            setTimeout(() => {
                window.location.href = 'supplier-dashboard.html';
            }, 1500);
            return;
        }
        
        // Pre-fill email from auth
        const emailInput = document.getElementById('businessEmail');
        if (emailInput) emailInput.value = user.email || '';
        
    } catch (error) {
        console.error('Auth check error:', error);
        showToast('Authentication error. Please login again.', 'error');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2000);
    } finally {
        showLoading(false);
    }
}

// ============================================
// LOAD DISTRICTS
// ============================================
async function loadDistricts() {
    try {
        // Try to load from database first
        const { data, error } = await sb
            .from('districts')
            .select('id, name')
            .eq('is_active', true)
            .order('name', { ascending: true });
            
        // Check if data exists and is an array
        if (error) {
            console.warn('Error loading districts from DB:', error);
            districts = [...ugandaDistricts].sort();
        } else if (!data || !Array.isArray(data) || data.length === 0) {
            console.log('No districts in database, using hardcoded list');
            districts = [...ugandaDistricts].sort();
        } else {
            console.log('Loaded districts from database:', data.length);
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
// MAP INITIALIZATION (Optional)
// ============================================
function initMap() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;
    
    // Initialize map with default view
    map = L.map('map').setView([0.3136, 32.5811], 12); // Kampala
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    // Add click handler to place marker (optional)
    map.on('click', function(e) {
        placeMarker(e.latlng.lat, e.latlng.lng);
        reverseGeocode(e.latlng.lat, e.latlng.lng);
    });
}

function placeMarker(lat, lng) {
    if (marker) {
        map.removeLayer(marker);
    }
    
    marker = L.marker([lat, lng], {
        draggable: true
    }).addTo(map);
    
    marker.on('dragend', function(e) {
        const position = e.target.getLatLng();
        reverseGeocode(position.lat, position.lng);
    });
    
    selectedLat = lat;
    selectedLng = lng;
}

// ============================================
// OPTIONAL GEOCODING (with error suppression)
// ============================================
function initLocationSearch() {
    const searchBtn = document.getElementById('searchLocationBtn');
    const searchInput = document.getElementById('locationSearch');
    
    if (!searchBtn || !searchInput) return;
    
    searchBtn.addEventListener('click', function() {
        performLocationSearch();
    });
    
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            performLocationSearch();
        }
    });
}

async function performLocationSearch() {
    const query = document.getElementById('locationSearch').value;
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
            {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'SourceXB2B/1.0'
                }
            }
        );
        
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error('Network error');
        
        const data = await response.json();
        
        if (data && data.length > 0) {
            const location = data[0];
            const lat = parseFloat(location.lat);
            const lng = parseFloat(location.lon);
            
            map.setView([lat, lng], 15);
            placeMarker(lat, lng);
            
            if (location.display_name) {
                document.getElementById('detailedAddress').value = location.display_name;
            }
            
            showToast('Location found!', 'success');
        } else {
            showToast('Location not found', 'warning');
        }
    } catch (error) {
        console.warn('Geocoding error (non-critical):', error);
        showToast('Search failed - please enter address manually', 'warning');
    } finally {
        showLoading(false);
    }
}

async function reverseGeocode(lat, lng) {
    // This is optional - don't show errors
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
            {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'SourceXB2B/1.0'
                }
            }
        );
        
        clearTimeout(timeoutId);
        
        if (!response.ok) return;
        
        const data = await response.json();
        
        if (data && data.display_name) {
            document.getElementById('detailedAddress').value = data.display_name;
        }
    } catch (error) {
        // Silently fail - this is optional
    }
}

// ============================================
// PHONE VALIDATION
// ============================================
function isValidPhone(phone) {
    if (!phone) return false;
    // Allow 7-12 digits (local number without country code)
    return /^[0-9]{7,12}$/.test(phone.replace(/\D/g, ''));
}

function formatPhoneNumber(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length > 0) {
        // Just store the digits - country code will be added separately
        input.value = value;
    }
}

// ============================================
// SETUP EVENT LISTENERS
// ============================================
function setupEventListeners() {
    const nextBtn = document.getElementById('nextToStep2');
    const backBtn = document.getElementById('backToStep1');
    const submitBtn = document.getElementById('submitVerification');
    
    if (nextBtn) nextBtn.addEventListener('click', validateStep1);
    if (backBtn) backBtn.addEventListener('click', () => goToStep(1));
    if (submitBtn) submitBtn.addEventListener('click', submitVerification);
    
    // Phone input formatting (including WhatsApp)
    const phoneInputs = ['phone', 'altPhone', 'verificationPhone', 'whatsappNumber'];
    phoneInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', function() {
                formatPhoneNumber(this);
            });
        }
    });
}

// ============================================
// STEP NAVIGATION
// ============================================
function goToStep(step) {
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
    
    const fill = document.getElementById('progressFill');
    if (fill) {
        fill.style.width = `${((step - 1) / 1) * 100}%`;
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
    document.querySelectorAll('.form-input, .form-select').forEach(e => e.classList.remove('error'));
    
    let isValid = true;
    
    // Get values
    const email = document.getElementById('businessEmail')?.value.trim() || '';
    const businessName = document.getElementById('businessName')?.value.trim() || '';
    const phone = document.getElementById('phone')?.value.trim() || '';
    const altPhone = document.getElementById('altPhone')?.value.trim() || '';
    const whatsapp = document.getElementById('whatsappNumber')?.value.trim() || '';
    const businessType = document.getElementById('businessType')?.value || '';
    const terms = document.getElementById('acceptTerms')?.checked || false;
    
    // Validate email
    if (!email) {
        showFieldError('businessEmail', 'Email is required');
        isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showFieldError('businessEmail', 'Enter a valid email address');
        isValid = false;
    }
    
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
        showFieldError('phone', 'Enter a valid phone number');
        isValid = false;
    }
    
    // Validate alternative phone if provided
    if (altPhone && !isValidPhone(altPhone)) {
        showFieldError('altPhone', 'Enter a valid phone number');
        isValid = false;
    }
    
    // Validate WhatsApp
    if (!whatsapp) {
        showFieldError('whatsappNumber', 'WhatsApp number is required');
        isValid = false;
    } else if (!isValidWhatsApp(whatsapp)) {
        showFieldError('whatsappNumber', 'Enter a valid WhatsApp number');
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
        // Store data in session (including WhatsApp)
        const businessInfo = {
            email,
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
// SUBMIT VERIFICATION
// ============================================
async function submitVerification() {
    // Validate form
    const detailedAddress = document.getElementById('detailedAddress')?.value.trim() || '';
    const city = document.getElementById('city')?.value.trim() || '';
    const district = document.getElementById('district')?.value || '';
    const country = document.getElementById('country')?.value || 'Uganda';
    const contactPerson = document.getElementById('contactPerson')?.value.trim() || '';
    const verificationPhone = document.getElementById('verificationPhone')?.value.trim() || '';
    const verifyLocation = document.getElementById('verifyLocation')?.checked || false;
    
    if (!detailedAddress) {
        showToast('Please enter your business address', 'error');
        return;
    }
    
    if (!city) {
        showToast('Please enter city/town', 'error');
        return;
    }
    
    if (!district) {
        showToast('Please select district', 'error');
        return;
    }
    
    if (!contactPerson) {
        showToast('Please enter contact person name', 'error');
        return;
    }
    
    if (!verificationPhone) {
        showToast('Please enter verification phone number', 'error');
        return;
    }
    
    if (!isValidPhone(verificationPhone)) {
        showToast('Please enter a valid phone number', 'error');
        return;
    }
    
    if (!verifyLocation) {
        showToast('Please confirm your location information', 'error');
        return;
    }
    
    showLoading(true, 'Submitting your application...');
    
    try {
        // Get business info from session
        const businessInfo = JSON.parse(sessionStorage.getItem('supplierBusinessInfo'));
        
        if (!businessInfo) {
            throw new Error('Business information not found. Please restart registration.');
        }
        
        // Format full phone numbers
        const fullPhone = businessInfo.countryCode + businessInfo.phone;
        const fullAltPhone = businessInfo.altPhone ? businessInfo.countryCode + businessInfo.altPhone : null;
        const fullVerificationPhone = businessInfo.countryCode + verificationPhone;
        const fullWhatsapp = businessInfo.countryCode + businessInfo.whatsapp;
        
        // Update profile
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
                business_email: businessInfo.email,
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

        // Insert WhatsApp number into supplier_whatsapp table
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
            // Don't throw - continue with registration even if WhatsApp save fails
            // But notify admin
            await sb
                .from('notifications')
                .insert({
                    user_id: currentUser.id,
                    type: 'admin_alert',
                    title: 'WhatsApp Save Failed',
                    message: `Failed to save WhatsApp for ${businessInfo.businessName}: ${whatsappError.message}`,
                    link: '/admin/supplier-approvals.html'
                });
        }

        // Create notification for admin
        await sb
            .from('notifications')
            .insert({
                user_id: currentUser.id,
                type: 'admin_alert',
                title: 'New Supplier Registration',
                message: `${businessInfo.businessName} has registered and awaits verification`,
                link: '/admin/supplier-approvals.html'
            });

        // Update WhatsApp preview in success modal
        const previewEl = document.getElementById('previewWhatsapp');
        if (previewEl) {
            previewEl.textContent = fullWhatsapp;
        }
        
        // Clear session storage
        sessionStorage.removeItem('supplierBusinessInfo');
        
        // Show success modal
        showLoading(false);
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
function showLoading(show, message = 'Loading...') {
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
        info: '#6B21E5',  // SourceX Purple
        warning: '#F59E0B'
    };
    
    toast.style.backgroundColor = colors[type] || colors.info;
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Modal functions
window.closeSuccessModal = function() {
    const modal = document.getElementById('successModal');
    if (modal) modal.classList.remove('show');
    window.location.href = 'supplier-dashboard.html';
};

// Expose functions globally
window.validateStep1 = validateStep1;
window.goToStep = goToStep;
window.submitVerification = submitVerification;