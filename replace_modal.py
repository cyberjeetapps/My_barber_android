import re

with open('/Users/apple/Cyberjeet Project/External/MyBarber/Android Application/MyBarber_Deployment_Final/app/(tabs)/services.tsx', 'r') as f:
    content = f.read()

# Define the start and end of the block to replace
start_marker = "    {showBookingModal && selectedService && (\n      <Modal\n        visible={showBookingModal}"
end_marker = "      </Modal>\n    )}"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker, start_idx) + len(end_marker)

if start_idx == -1 or end_idx == -1:
    print("Could not find block!")
    exit(1)

old_block = content[start_idx:end_idx]

# Extract sections from the old block
# 1. Error section
error_match = re.search(r'(\{error \? \(\s*<View style=\{styles\.errorContainer\}>\s*<Text style=\{styles\.errorText\}>\{error\}</Text>\s*</View>\s*\) : null\})', old_block)
error_section = error_match.group(1) if error_match else ""

# 2. Service Info section
service_info_match = re.search(r'(<View style=\{styles\.serviceInfo\}>.*?</View>\s*)(?:\{selectedCategory !== \'packages\' && \()', old_block, re.DOTALL)
service_info_section = service_info_match.group(1) if service_info_match else ""
if not service_info_section:
    # Fallback regex if it doesn't match
    service_info_match = re.search(r'(<View style=\{styles\.serviceInfo\}>.*?</View>)', old_block, re.DOTALL)
    service_info_section = service_info_match.group(1)

# 3. Date Picker
date_picker_match = re.search(r'(<View style=\{styles\.datePickerContainer\}>.*?</View>)', old_block, re.DOTALL)
date_picker_section = date_picker_match.group(1) if date_picker_match else ""

# 4. Time slots
time_slots_match = re.search(r'(<Text style=\{\[styles\.timeSlotsTitle.*?\}</View>)', old_block, re.DOTALL)
time_slots_section = time_slots_match.group(1) if time_slots_match else ""

# 5. Chair section
chair_section_match = re.search(r'(\{chairSelectionApplies && selectedTimeSlot && \(.*?\)\})', old_block, re.DOTALL)
chair_section = chair_section_match.group(1) if chair_section_match else ""

# 6. Payment Options
payment_options_match = re.search(r'(<View style=\{styles\.paymentOptionsContainer\}>.*?</View>)', old_block, re.DOTALL)
payment_options_section = payment_options_match.group(1) if payment_options_match else ""

# 7. Family Booking
family_booking_match = re.search(r'(<TouchableOpacity\s*style=\{\[\s*styles\.familyBookingButton.*?</TouchableOpacity>)', old_block, re.DOTALL)
family_booking_section = family_booking_match.group(1) if family_booking_match else ""

# 8. Family Selector
family_selector_match = re.search(r'(\{showFamilySelector && \(.*?\)\})', old_block, re.DOTALL)
family_selector_section = family_selector_match.group(1) if family_selector_match else ""

# 9. Coupon section
coupon_section_match = re.search(r'(\{selectedCategory !== \'packages\' && \(\s*<View style=\{styles\.couponSection\}>.*?\)\})', old_block, re.DOTALL)
coupon_section = coupon_section_match.group(1) if coupon_section_match else ""

# 10. Terms row
terms_row_match = re.search(r'(<TouchableOpacity\s*style=\{styles\.termsRow\}.*?</TouchableOpacity>)', old_block, re.DOTALL)
terms_row = terms_row_match.group(1) if terms_row_match else ""

# 11. Terms Soft Link
terms_soft_link_match = re.search(r'(<TouchableOpacity\s*onPress=\{\(e\) => \{ e\.stopPropagation\?\.\(\); openTermsInBrowser\(\); \}\}\s*style=\{styles\.termsSoftLinkRow\}.*?</TouchableOpacity>)', old_block, re.DOTALL)
terms_soft_link = terms_soft_link_match.group(1) if terms_soft_link_match else ""

# 12. Terms Required
terms_required_match = re.search(r'(\{!agreedToTerms && \(\s*<Text style=\{styles\.termsRequiredText\}>\{uiTexts\.termsRequired\}</Text>\s*\)\})', old_block, re.DOTALL)
terms_required = terms_required_match.group(1) if terms_required_match else ""


replacement = f"""    {{showBookingModal && selectedService && (
      <BookingWizardModal
        visible={{showBookingModal}}
        onClose={{() => {{
          setShowBookingModal(false);
          setShowFamilySelector(false);
          setFamilySlotsCount(1);
          setAgreedToTerms(false);
        }}}}
        shopName={{selectedService.shopName}}
        accentColor={{servicepriceColor()}}
        uiTexts={{uiTexts}}
        shopStaff={{shopStaff}}
        selectedBarber={{selectedBarber}}
        setSelectedBarber={{setSelectedBarber}}
        isPackage={{selectedCategory === 'packages'}}
        hasSelectedDateTime={{selectedCategory === 'packages' ? true : (!!selectedTimeSlot && (!chairSelectionApplies || !!selectedChair))}}
        onConfirm={{() => selectedCategory === 'packages' ? handlePackageBooking(selectedService) : handleSubmitBooking()}}
        isConfirmDisabled={{bookingLoading || packageBookingLoading || !agreedToTerms || (selectedCategory !== 'packages' && !selectedTimeSlot) || (chairSelectionApplies && !!selectedTimeSlot && !selectedChair)}}
        confirmLoading={{bookingLoading || packageBookingLoading}}
        renderDateAndTime={{() => (
          <>
            {{selectedCategory !== 'packages' && (
              <>
                {date_picker_section}
                {time_slots_section}
                {chair_section}
              </>
            )}}
          </>
        )}}
        renderServices={{() => (
          <>
            {error_section}
            {service_info_section}
          </>
        )}}
        renderSummary={{() => (
          <>
            {{selectedCategory !== 'packages' && (
              <>
                {payment_options_section}
                {family_booking_section}
                {family_selector_section}
                {coupon_section}
              </>
            )}}
            {terms_row}
            {terms_soft_link}
            {terms_required}
          </>
        )}}
      />
    )}}"""

new_content = content[:start_idx] + replacement + content[end_idx:]

with open('/Users/apple/Cyberjeet Project/External/MyBarber/Android Application/MyBarber_Deployment_Final/app/(tabs)/services.tsx', 'w') as f:
    f.write(new_content)

print("Replaced successfully!")
