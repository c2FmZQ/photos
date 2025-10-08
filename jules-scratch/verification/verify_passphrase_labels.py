from playwright.sync_api import Page, expect
import re

def verify_passphrase_labels(page: Page):
    # 1. Arrange: Go to the application.
    page.goto("http://localhost:8080")

    # 2. Act: Register a new user.
    page.get_by_role("tab", name=re.compile("Register", re.IGNORECASE)).click()
    page.get_by_label("Email:").fill("test@example.com")
    page.get_by_label("New password:").fill("password123")
    page.get_by_label("Confirm password:").fill("password123")
    page.get_by_role("button", name=re.compile("Create Account", re.IGNORECASE)).click()

    # 3. Assert: The passphrase prompt should be visible.
    passphrase_div = page.locator("#passphrase-div")
    expect(passphrase_div).to_be_visible()

    # 4. Assert: The labels should have the correct text.
    passphrase_label = page.locator("#passphrase-input-label")
    retype_passphrase_label = page.locator("#passphrase-input2-label")

    expect(passphrase_label).to_have_text("Passphrase")
    expect(retype_passphrase_label).to_have_text("Retype passphrase")

    # 5. Screenshot: Capture the final result for visual verification.
    page.screenshot(path="jules-scratch/verification/verification.png")