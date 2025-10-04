from playwright.sync_api import sync_playwright, expect
import time

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()
    try:
        page.goto("http://localhost:8080/")

        # Click the register button
        register_button = page.locator("text=Register")
        expect(register_button).to_be_visible()
        register_button.click()

        # Fill in the registration form
        page.locator("input[name=\"email\"]").fill("testuser@example.com")
        page.locator("input[name=\"password\"]").fill("password123")
        page.locator("input[name=\"confirm-password\"]").fill("password123")
        page.locator("button:has-text('Create Account')").click()

        # After registration, we should be logged in.
        # The account button should be visible.
        account_button = page.locator('button[title="Account menu"]')
        expect(account_button).to_be_visible(timeout=20000)

        account_button.click()

        # The profile button should be visible now.
        profile_button = page.locator("a:has-text('Profile')")
        expect(profile_button).to_be_visible()
        profile_button.click()

        # Now we are on the profile page. The language selector should be here.
        language_selector = page.locator('select')
        expect(language_selector).to_be_visible()

        # Take a screenshot of the profile modal with the language selector
        page.locator("h1:has-text('Profile')").owner.screenshot(path="jules-scratch/verification/language_selector.png")

        # Select Japanese
        language_selector.select_option('ja')

        # The page will reload after changing language.
        # Let's check for the logout button text to change.
        # It's inside the account menu.
        account_button.click()
        logout_button = page.locator("a:has-text('ログアウト')")
        expect(logout_button).to_be_visible()

        # Take a screenshot of the page in Japanese
        page.screenshot(path="jules-scratch/verification/japanese_page.png")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)