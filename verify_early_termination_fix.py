from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto('http://localhost:3001')
        page.wait_for_selector('text=Enter your coordinator PIN')

        page.evaluate("() => document.querySelectorAll('.keypad button.kk')[0].click()") # 1
        page.evaluate("() => document.querySelectorAll('.keypad button.kk')[1].click()") # 2
        page.evaluate("() => document.querySelectorAll('.keypad button.kk')[2].click()") # 3
        page.evaluate("() => document.querySelectorAll('.keypad button.kk')[3].click()") # 4

        # Click Unlock
        page.evaluate("() => document.querySelector('button.kk.go').click()")

        page.wait_for_selector('text=Patients')

        # Click Start My Shift on DailyBriefing overlay
        try:
            page.wait_for_selector('button:has-text("Start My Shift")', timeout=2000)
            page.locator('button:has-text("Start My Shift")').first.click()
            time.sleep(1)
        except Exception:
            pass

        # Open HMC-047 via the dashboard link/card
        page.evaluate("() => { const rows = document.querySelectorAll('.pt-row'); for (let i=0; i<rows.length; i++) { if (rows[i].innerText.includes('HMC-047')) { rows[i].click(); break; } } }")
        time.sleep(1)

        # Mark DTQ Positive if we haven't
        # Notice that in 1_patient_detail.png we saw "Open Wizard ->" in the red bar instead of Start RV Tasks! That's why step 2 failed.
        # Oh, in PatientDetail, if alert='DTQ_POSITIVE' it shows "Open Wizard ->" in the alert bar OR "Open RV Protocol Wizard" in the big button.
        page.evaluate("() => { const btns = document.querySelectorAll('button'); for (let b of btns) { if (b.innerText.includes('Open RV Protocol Wizard')) { b.click(); break; } } }")
        time.sleep(1)

        page.screenshot(path='/home/jules/verification/2_wizard_open_fixed.png')

        # Accept the window.confirm dialog automatically
        page.on("dialog", lambda dialog: dialog.accept())

        # Click Fail / Early Terminate
        page.evaluate("() => { const btns = document.querySelectorAll('button'); for (let b of btns) { if (b.innerText.includes('Fail / Early Terminate')) { b.click(); break; } } }")
        time.sleep(1)

        page.screenshot(path='/home/jules/verification/3_early_termination_fixed.png')

        # Close patient detail and go back to dashboard to see ET badge
        page.evaluate("() => { const btns = document.querySelectorAll('button'); for (let b of btns) { if (b.innerText === 'Back') { b.click(); break; } } }")
        time.sleep(1)

        page.screenshot(path='/home/jules/verification/4_dashboard_et.png')

        browser.close()

if __name__ == '__main__':
    run()
