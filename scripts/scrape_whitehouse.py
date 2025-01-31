import requests
from bs4 import BeautifulSoup
from datetime import datetime
import os
from supabase import create_client, Client

class WhiteHouseActions:
    def __init__(self):
        self.base_url = "https://www.whitehouse.gov/presidential-actions/"
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        # Initialize Supabase client
        supabase_url = os.environ.get("VITE_SUPABASE_URL")
        supabase_key = os.environ.get("VITE_SUPABASE_ANON_KEY")
        self.supabase: Client = create_client(supabase_url, supabase_key)

    def get_presidential_actions(self, max_pages=5):
        all_actions = []
        
        # First, get the main page
        try:
            response = requests.get(self.base_url, headers=self.headers)
            response.raise_for_status()
            all_actions.extend(self._parse_page(response.text))
            print(f"Processed main page, found {len(all_actions)} posts")
        except requests.RequestException as e:
            print(f"Error fetching main page: {str(e)}")
        
        # Then get subsequent pages
        for page in range(2, max_pages + 1):
            try:
                url = f"{self.base_url}page/{page}/"
                response = requests.get(url, headers=self.headers)
                response.raise_for_status()
                
                posts = self._parse_page(response.text)
                if not posts:  # No more posts found
                    break
                
                all_actions.extend(posts)
                print(f"Processed page {page}, found {len(posts)} posts")
                
            except requests.RequestException as e:
                print(f"Error fetching page {page}: {str(e)}")
                continue
                
        return all_actions

    def _parse_page(self, html_content):
        posts = []
        soup = BeautifulSoup(html_content, 'html.parser')
        post_items = soup.find_all('li', class_='wp-block-post')
        
        for post in post_items:
            title_elem = post.find('h2', class_='wp-block-post-title')
            if title_elem and title_elem.find('a'):
                title_link = title_elem.find('a')
                title = title_link.get_text().strip()
                url = title_link['href']
                
                date_elem = post.find('div', class_='wp-block-post-date')
                if date_elem and date_elem.find('time'):
                    time_elem = date_elem.find('time')
                    date = time_elem['datetime']
                    
                    posts.append({
                        'title': title,
                        'date': date,
                        'url': url
                    })
        
        return posts

    def store_in_supabase(self, actions):
        for action in actions:
            # Insert into title_matches table
            try:
                self.supabase.table('title_matches').insert({
                    'whitehouse_title': action['title'],
                    'whitehouse_date': action['date'],
                    'whitehouse_url': action['url'],
                    'match_confidence': 0.0  # Will be updated by matching process
                }).execute()
                
                print(f"Stored action: {action['title']}")
                
            except Exception as e:
                print(f"Error storing action: {str(e)}")

if __name__ == "__main__":
    scraper = WhiteHouseActions()
    actions = scraper.get_presidential_actions(max_pages=5)
    if actions:
        scraper.store_in_supabase(actions)
        print(f"Successfully processed {len(actions)} actions")