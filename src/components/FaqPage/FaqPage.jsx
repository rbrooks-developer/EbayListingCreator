import { useState } from 'react';
import styles from './FaqPage.module.css';

const FAQS = [
  {
    category: 'Getting Started',
    items: [
      {
        q: 'How do I connect my eBay account?',
        a: 'In Step 1, enter your ZIP or postal code and click "Connect Your eBay Account." You\'ll be redirected to eBay to authorize the app. Once you approve access, you\'ll be brought back automatically and your categories, shipping services, and fulfillment policies will be downloaded.',
      },
      {
        q: 'Do I need an eBay developer account?',
        a: 'No. The app uses standard eBay OAuth — the same login you use on eBay.com. No developer credentials or App IDs are needed.',
      },
      {
        q: 'Why do I need to enter a ZIP code before connecting?',
        a: 'eBay requires a postal code on every listing for buyer shipping estimates. Entering it once here saves it as the default for all your listings. It is stored in your browser so you won\'t need to type it again after disconnecting.',
      },
      {
        q: 'What happens if I disconnect?',
        a: 'Disconnecting clears your eBay access token and removes all listings from the grid. Your ZIP code is remembered for next time. To list again, simply reconnect.',
      },
    ],
  },
  {
    category: 'Building Listings',
    items: [
      {
        q: 'How do I add a listing?',
        a: 'Click "+ Add Row" in the Listings toolbar. A blank row appears in the grid. Fill in the Title, select a Category, set your price and condition, then click "Post to eBay" when ready.',
      },
      {
        q: 'What fields are required to post a listing?',
        a: 'Title and Category are required. Without them the "Post to eBay" button stays disabled. Price is required for Buy It Now listings. Auction listings need a Start Price and Auction Days.',
      },
      {
        q: 'How do I fill in Item Specifics?',
        a: 'Click the "Specifics" button in the listing row. A modal opens showing all available item specifics for that category. Required fields are highlighted. Fill them in and click Save. You can also set up Rules to fill these automatically.',
      },
      {
        q: 'Can I list both Buy It Now and Auction formats?',
        a: 'Yes. Use the "Listing Type" dropdown in each row to switch between Buy It Now and Auction. Auction rows show Start Price and Auction Days fields; Buy It Now rows show Price. You can enable Best Offer on either format.',
      },
      {
        q: 'How does Best Offer work?',
        a: 'Enter a minimum offer amount in the "Best Offer ($)" column. If you leave it blank, Best Offer is disabled for that listing. The amount you enter becomes the minimum offer a buyer can submit.',
      },
    ],
  },
  {
    category: 'Images',
    items: [
      {
        q: 'How do I add images to a listing?',
        a: 'Click the "Images" button in the listing row to open the Image Manager. Click "+ Add Images" or the "+" tile to browse your computer for photos. You can select multiple images at once. Images are uploaded directly to eBay\'s picture service in the background.',
      },
      {
        q: 'How many images can I add per listing?',
        a: 'Up to 24 images per listing, which is eBay\'s maximum.',
      },
      {
        q: 'How do I set the main image?',
        a: 'The first image in the grid is always the main image — it\'s shown in eBay search results and at the top of your listing. Drag and drop any image to the first slot to make it the main photo.',
      },
      {
        q: 'How do I reorder images?',
        a: 'In the Image Manager, drag any thumbnail to a new position. The order you set here is the order eBay will display them in the listing.',
      },
    ],
  },
  {
    category: 'Shipping',
    items: [
      {
        q: 'What is a Shipping Policy vs. a Shipping Method?',
        a: 'A Shipping Policy is a saved template in your eBay account (set up in eBay\'s Seller Hub) that bundles together your shipping preferences. A Shipping Method is the specific carrier service used for calculated shipping — for example, USPS Ground Advantage. Both can be set per listing.',
      },
      {
        q: 'How do I choose a shipping method?',
        a: 'Click the shipping method cell in a listing row. A picker opens with all available services grouped by category (Economy, Standard, Expedited, One-Day). Use the search bar to filter by name. The selected service and its estimated delivery time are shown.',
      },
      {
        q: 'Do I need to fill in dimensions and weight?',
        a: 'Only if you are using calculated shipping. If your shipping policy uses flat-rate shipping the dimensions and weight fields are optional.',
      },
    ],
  },
  {
    category: 'Listing Rules',
    items: [
      {
        q: 'What are Listing Rules?',
        a: 'Rules automatically fill in item specifics based on a listing\'s category and title keywords. For example: if the category is "Bobbleheads" and the title contains "Funko", a rule can automatically set the "Type" specific to "Vinyl Figure".',
      },
      {
        q: 'How do I create a rule?',
        a: 'Click the "Rules" button in the Listings toolbar. Sign in if prompted, then click "+ Add Rule." Choose a category, select the item specific and its value, and optionally enter comma-separated keywords from the title. Leave keywords blank to apply the rule to every listing in that category.',
      },
      {
        q: 'When do rules run?',
        a: 'Rules run automatically whenever you add or change a listing. They only fill in empty item specific fields — they never overwrite values you have entered manually.',
      },
      {
        q: 'Do rules work when importing from a spreadsheet?',
        a: 'Yes. Rules are applied to imported listings the same way they are applied to manually entered ones — as soon as the rows appear in the grid.',
      },
      {
        q: 'Why do I need to sign in to use Rules?',
        a: 'Rules are saved to your account so they persist across sessions and devices. Sign in with Google or email using the Sign In button in the top right.',
      },
    ],
  },
  {
    category: 'Import & Export',
    items: [
      {
        q: 'What file formats can I import?',
        a: 'Excel (.xlsx, .xls) and CSV (.csv) files are supported.',
      },
      {
        q: 'Where can I get the import template?',
        a: 'Click the "template spreadsheet" link in the Listings section header. It downloads an Excel file with all supported columns pre-labelled and sample data in the first row.',
      },
      {
        q: 'What columns does the import support?',
        a: 'Title, Description, Category, Qty, Condition, Listing Type, Buy It Now Price, Auction Start Price, Auction Days, Best Offer Price, Shipping Method, Length, Width, Height, Weight Pounds, Weight Ounces, and Image URL. Category and Shipping Method are matched by name automatically if you are connected to eBay.',
      },
      {
        q: 'What happens if the category in my spreadsheet doesn\'t match?',
        a: 'A warning is shown in the import summary and that listing\'s category is left blank for manual selection. You must be connected to eBay when importing for category matching to work.',
      },
      {
        q: 'Can I export my listings back to Excel?',
        a: 'Yes. Click "Export Excel" in the toolbar. The exported file uses the same column format as the import template, so it can be re-imported later.',
      },
    ],
  },
  {
    category: 'Posting',
    items: [
      {
        q: 'How do I post a listing to eBay?',
        a: 'Click the "Post to eBay" button in the Status column of any row. The button is enabled once you have a Title and Category. The status updates in real time — green "Listed" with the eBay item ID on success, or a red error message if something needs fixing.',
      },
      {
        q: 'What does Post All do?',
        a: '"Post All" appears in the toolbar when there are listings ready to post. It submits every row that has a title and category and has not been posted yet, one at a time. You can watch each row update as it goes.',
      },
      {
        q: 'What if a listing fails to post?',
        a: 'The row shows a red "Error" badge with the eBay error message. Fix the issue in that row and click "Retry" to try again.',
      },
      {
        q: 'Will my listings be saved if I refresh the page?',
        a: 'Yes. Listings are automatically saved in your browser\'s local storage and restored when you reload the page. Images that were already uploaded to eBay will still display correctly after a refresh.',
      },
    ],
  },
];

export default function FaqPage() {
  const [openItems, setOpenItems] = useState({});

  function toggle(key) {
    setOpenItems((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <section className={styles.section} id="faq">
      <div className={styles.container}>
        <div className={styles.header}>
          <h2 className={styles.title}>Frequently Asked Questions</h2>
          <p className={styles.subtitle}>
            Everything you need to know about using eBay Listing Creator.
          </p>
        </div>

        <div className={styles.faqBody}>
          {FAQS.map((group) => (
            <div key={group.category} className={styles.group}>
              <h3 className={styles.groupTitle}>{group.category}</h3>
              <div className={styles.itemList}>
                {group.items.map((item, i) => {
                  const key = `${group.category}-${i}`;
                  const isOpen = !!openItems[key];
                  return (
                    <div key={key} className={`${styles.item} ${isOpen ? styles.itemOpen : ''}`}>
                      <button
                        className={styles.question}
                        onClick={() => toggle(key)}
                        aria-expanded={isOpen}
                      >
                        <span>{item.q}</span>
                        <span className={styles.chevron} aria-hidden="true">
                          {isOpen ? '▲' : '▼'}
                        </span>
                      </button>
                      {isOpen && (
                        <div className={styles.answer}>{item.a}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
